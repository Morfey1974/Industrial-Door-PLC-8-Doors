#include "doors_task.h"

#include <stdio.h>
#include <string.h>
#include <stdbool.h>

#include "cmsis_os.h"
#include "main.h"

#include "door_hal.h"

/* Stage-2 system */
#include "system/app_events.h"
#include "system/app_health.h"
#include "system/config_service.h"
#include "system/system_node.h"
#include "system/comms_task.h"
#include "logic/logic_core.h"
#include "logic/global_door_id.h"
#include "config/config_format.h"

#include "FreeRTOS.h"
#include "task.h"
#include "semphr.h"

/* ============================================================
   Doors Task (ЭТАП 3 + ЭТАП 4.3/4.4/4.5)
   ------------------------------------------------------------
   Требования (по плану/ТЗ):

   ЭТАП 3 (то, что уже было и должно сохраниться):
     - Alarm (локальный приоритет) включает сигнализацию (LED/Buzzer)
     - При Alarm дверь ДОЛЖНА БЫТЬ РАЗБЛОКИРОВАНА (если была locked -> unlock)
     - Держим unlock до следующего нажатия Alarm
     - После выхода из Alarm — восстанавливаем lock-state, который был до Alarm
     - Инвариант: запрет LOCK при открытой двери

   ЭТАП 4.3 (тайм-аут открытой двери):
     - Тайм-аут допустимого открытого состояния задается в конфигураторе одинаковый для всех дверей.
     - При превышении тайм-аута:
         * включается режим сигнализации;
         * логика блокировки остальных дверей продолжает действовать.
     - После закрытия двери сигнализация возвращается в нормальный режим.

   ЭТАП 4.4 (тайм-аут после закрытия двери):
     - Для каждой двери может быть задан тайм-аут после закрытия двери (delay реакции логики).
     - DoorTask:
         * фиксирует момент перехода OPEN->CLOSE;
         * публикует EVT_DOOR_POST_CLOSE_READY после выдержки (или сразу если timeout=0).
     - ВАЖНО: DoorTask НЕ реализует “логику зависимостей дверей” — это зона Logic Core.

   ЭТАП 4.5 (сигнализация как система):
     - Сигнализация может включаться по нескольким причинам:
         * manual (кнопка Alarm)
         * open timeout (слишком долго открыта)
     - Сигнализация активна, если есть хотя бы одна причина (mask != 0).
     - Сигнализация выключается только когда сняты все причины.
     - При включении/выключении публикуются события EVT_DOOR_SIGNAL_ON/OFF.

   Важно:
     - DoorHAL_* только (без BSP_*)
     - Heartbeat + EventBus (этап 2)
     - Вывод логов (UART/UDP/ITM) не делаем отсюда (реалтайм),
       для этого есть EventBus + LoggerTask/CommsTask.
   ============================================================ */

static AppDoorState_t s_doors[APP_DOOR_MAX];

/* ------------------------------------------------------------
   Конфиг (заготовка под WEB-конфигуратор)
   ------------------------------------------------------------ */

/* OPEN timeout (общий для всех дверей), ms. 0 = выключено.
 * Позже будет устанавливаться из WEB, сейчас доступен через DoorsCfg_SetOpenTimeoutMs().
 */
static uint32_t s_cfgOpenTimeoutMs = 0U;

/* NC-дверь: окно разблокировки и задержка блокировки после закрытия (из конфига) */
static uint32_t s_cfgNcUnlockWindowMs       = 5000U;
static uint32_t s_cfgNcLockDelayAfterCloseMs = 1000U;

extern project_config_t g_project_cfg;

/* ------------------------------------------------------------
   Локальные сервисные состояния (не “модель двери”, а служебные переменные)
   ------------------------------------------------------------ */

static uint8_t  s_prevAlarmRaw[APP_DOOR_MAX];
static uint32_t s_lastAlarmEdgeMs[APP_DOOR_MAX];
/* NC: момент непрерывного «Alarm=отпущен» — нужен для антидребезга фронта нажатия (иначе шум/дребезг
 * даёт ложные импульсы → краткие окна разблокировки и моргание зелёного LED при фактически заблокированной двери). */
static uint32_t s_ncAlarmLowStartMs[APP_DOOR_MAX];

static uint32_t s_lastBlinkMs[APP_DOOR_MAX];
static uint8_t  s_blinkPhase[APP_DOOR_MAX]; /* 0=GREEN, 1=RED */

/* Сохранение lock-стейта при входе в сигнализацию (чтобы восстановить при выходе) */
static uint8_t  s_lockSavedBeforeAlarm[APP_DOOR_MAX];

/* Pending commands from LogicCore (Этап 4.3 API управления дверью) */
typedef struct
{
    uint8_t  pending;
    uint8_t  lock_on;     /* 1=lock, 0=unlock */
    uint16_t _rsvd16;
    uint32_t source;
    uint32_t expireMs;    /* 0 = no TTL */
} door_lock_req_t;

static door_lock_req_t s_lockReq[APP_DOOR_MAX];

/* Мьютекс для синхронизации доступа к данным дверей */
static SemaphoreHandle_t s_doors_mutex = NULL;

/* ============================================================
   Вспомогательные функции
   ============================================================ */

static uint8_t door_is_in_local_config(uint8_t local_door_id);
static uint8_t door_is_nc_type(uint8_t local_door_id);
static void door_deactivate_unused(uint8_t door1based, uint8_t idx);

static uint32_t GetMs(void)
{
    return HAL_GetTick();
}

static void publish_event(app_event_type_t type, uint32_t door1based, uint32_t arg)
{
    app_event_t evt;
    evt.type      = type;
    evt.source    = APP_SRC_DOOR_LOCAL;
    evt.door_id   = (uint8_t)(door1based & 0xFFu);
    evt._rsvd8    = 0U;
    evt.flags     = 0U;
    evt.arg       = arg;
    evt.ttl_ms    = 0U;
    evt.timestamp = (uint32_t)xTaskGetTickCount();
    (void)AppEvents_Publish(&evt, 0);
}

/* ============================================================
   Конфиг API (заготовка под WEB)
   ============================================================ */

uint8_t DoorsCfg_SetOpenTimeoutMs(uint32_t timeout_ms)
{
    /* 0 = отключено. Диапазоны/валидация будут на этапе конфигуратора. */
    uint32_t oldTimeout = s_cfgOpenTimeoutMs;
    s_cfgOpenTimeoutMs = timeout_ms;
    
    /* Логирование для отладки */
    
    /* Если таймаут изменился и дверь открыта, сбрасываем openSinceMs для всех открытых дверей,
     * чтобы таймаут начал отсчитываться заново с момента применения конфигурации.
     * Это важно, чтобы сигнализация срабатывала корректно при изменении конфигурации.
     */
    if (oldTimeout != timeout_ms && timeout_ms != 0U) {
        uint32_t now = GetMs();
        uint8_t resetCount = 0U;
        for (uint8_t i = 0; i < APP_DOOR_MAX; i++) {
            /* Только двери, описанные в конфиге узла */
            if (!door_is_in_local_config((uint8_t)(i + 1U)))
                continue;
            /* Если дверь открыта (не закрыта) и таймаут ещё не сработал */
            if (s_doors[i].physClosed == 0U && 
                (s_doors[i].alarmReasons & DOOR_ALARM_OPEN_TIMEOUT) == 0U) {
                /* Сбрасываем openSinceMs, чтобы таймаут начал отсчитываться заново */
                s_doors[i].openSinceMs = now;
                resetCount++;
            }
        }
        if (resetCount > 0U) {
        }
    }
    
    return 1U;
}

uint32_t DoorsCfg_GetOpenTimeoutMs(void)
{
    return s_cfgOpenTimeoutMs;
}

uint8_t DoorsCfg_SetPostCloseTimeoutMs(uint8_t door_id, uint32_t timeout_ms)
{
    if (door_id == 0U || door_id > APP_DOOR_MAX) return 0U;
    s_doors[door_id - 1U].postCloseTimeoutMs = timeout_ms;
    return 1U;
}

uint32_t DoorsCfg_GetPostCloseTimeoutMs(uint8_t door_id)
{
    if (door_id == 0U || door_id > APP_DOOR_MAX) return 0U;
    return s_doors[door_id - 1U].postCloseTimeoutMs;
}

uint8_t DoorsCfg_SetNcUnlockWindowMs(uint32_t ms)
{
    s_cfgNcUnlockWindowMs = ms;
    return 1U;
}

uint32_t DoorsCfg_GetNcUnlockWindowMs(void)
{
    return s_cfgNcUnlockWindowMs;
}

uint8_t DoorsCfg_SetNcLockDelayAfterCloseMs(uint32_t ms)
{
    s_cfgNcLockDelayAfterCloseMs = ms;
    return 1U;
}

uint32_t DoorsCfg_GetNcLockDelayAfterCloseMs(void)
{
    return s_cfgNcLockDelayAfterCloseMs;
}

/* ============================================================
   Публичное API состояния/управления
   ============================================================ */

AppDoorState_t* Doors_GetStateArray(void)
{
    /* ВАЖНО: Эта функция возвращает прямой указатель на массив.
     * Вызывающий код должен сам захватывать мьютекс перед использованием.
     * Для безопасного доступа используйте Doors_GetState() или Doors_GetStateArrayLocked().
     */
    return s_doors;
}

AppDoorState_t* Doors_GetStateArrayLocked(void)
{
    /* Инициализируем мьютекс, если еще не создан */
    if (!s_doors_mutex) {
        s_doors_mutex = xSemaphoreCreateMutex();
        if (!s_doors_mutex) return NULL;
    }

    /* Захватываем мьютекс для безопасного чтения */
    if (xSemaphoreTake(s_doors_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return NULL; /* Таймаут при захвате мьютекса */
    }

    return s_doors;
}

void Doors_ReleaseStateArray(void)
{
    if (s_doors_mutex) {
        xSemaphoreGive(s_doors_mutex);
    }
}

uint8_t Doors_RequestLock(uint8_t door_id, uint8_t lock_on, uint32_t source, uint32_t timeout_ms)
{
    if (door_id == 0U || door_id > APP_DOOR_MAX) return 0U;

    /* Слот не в конфигурации — не ставим команды и не меняем выходы */
    if (!door_is_in_local_config(door_id))
        return 0U;

    uint8_t idx = (uint8_t)(door_id - 1U);

    /* Инициализируем мьютекс, если еще не создан */
    if (!s_doors_mutex) {
        s_doors_mutex = xSemaphoreCreateMutex();
        if (!s_doors_mutex) return 0U;
    }

    /* Захватываем мьютекс для безопасного чтения состояния двери */
    if (xSemaphoreTake(s_doors_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return 0U; /* Таймаут при захвате мьютекса */
    }

    /* Приоритет сигнализации:
     * если сигнализация активна (любая причина) — внешние команды отвергаем.
     */
    uint8_t alarming = s_doors[idx].alarming;
    uint8_t doorClosed = s_doors[idx].physClosed;
    uint8_t doorLocked = s_doors[idx].locked;
    uint8_t hasPending = s_lockReq[idx].pending;
    /* ВАЖНО: pendingLock имеет смысл только если hasPending=1 */
    uint8_t pendingLock = hasPending ? s_lockReq[idx].lock_on : 0U;
    
    /* Освобождаем мьютекс перед записью в s_lockReq (это отдельный массив) */
    xSemaphoreGive(s_doors_mutex);

    if (alarming)
        return 0U;

    /* Сглаживание потока LOCK/UNLOCK от LogicCore: не дёргать замок лишний раз
     * при повторяющихся командах того же смысла (обновляем TTL, не перезаписываем pending).
     */
    uint8_t newLock = (lock_on != 0U) ? 1U : 0U;
    
    /* ЛОГИРОВАНИЕ: вход в Doors_RequestLock - удалено для уменьшения шума в логах */
    
    /* Случай 1: Дверь открыта, есть pending LOCK, приходит новая команда LOCK */
    if (hasPending && !doorClosed && pendingLock && newLock)
    {
        /* Не перезаписываем, только обновляем TTL, чтобы команда не истекла */
        if (timeout_ms == 0U)
            s_lockReq[idx].expireMs = 0U;
        else
            s_lockReq[idx].expireMs = GetMs() + timeout_ms;
        
        return 1U;
    }
    
    /* Случай 2: Дверь уже разблокирована, приходит команда UNLOCK */
    if (!newLock && (doorLocked == 0U))
    {
        /* Дверь уже разблокирована - проверяем тип pending команды */
        if (hasPending)
        {
            if (pendingLock)
            {
                /* Есть pending LOCK (дверь была открыта) - отменяем его командой UNLOCK */
                s_lockReq[idx].pending = 1U;
                s_lockReq[idx].lock_on = 0U;
                s_lockReq[idx].source = source;
                if (timeout_ms == 0U)
                    s_lockReq[idx].expireMs = 0U;
                else
                    s_lockReq[idx].expireMs = GetMs() + timeout_ms;
            }
            else
            {
                /* Есть pending UNLOCK для уже разблокированной двери - 
                 * сбрасываем pending, чтобы не обрабатывать команду в updateOneDoor.
                 * Это предотвращает ненужные переключения при keepalive командах.
                 */
                s_lockReq[idx].pending = 0U;
            }
        }
        else
        {
        }
        /* Если нет pending команды, просто игнорируем UNLOCK для уже разблокированной двери */
        return 1U;
    }
    
    /* Случай 3: Дверь уже заблокирована, приходит команда UNLOCK
     * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: если дверь заблокирована и приходит UNLOCK,
     * НЕ устанавливаем pending, а сразу применяем команду через прямой вызов.
     * Это предотвращает задержку и возможность для других команд вмешаться.
     */
    if (!newLock && (doorLocked != 0U) && doorClosed)
    {
        /* Дверь заблокирована и закрыта - проверяем тип pending команды */
        if (hasPending)
        {
            if (pendingLock)
            {
                /* Есть pending LOCK - отменяем его командой UNLOCK */
                s_lockReq[idx].pending = 1U;
                s_lockReq[idx].lock_on = 0U;
                s_lockReq[idx].source = source;
                if (timeout_ms == 0U)
                    s_lockReq[idx].expireMs = 0U;
                else
                    s_lockReq[idx].expireMs = GetMs() + timeout_ms;
            }
            else
            {
                /* Есть pending UNLOCK для уже заблокированной двери - 
                 * обновляем только TTL, не перезаписываем команду.
                 * Это предотвращает ненужные переключения при keepalive командах.
                 */
                if (timeout_ms == 0U)
                    s_lockReq[idx].expireMs = 0U;
                else
                    s_lockReq[idx].expireMs = GetMs() + timeout_ms;
            }
        }
        else
        {
            /* Нет pending команды - устанавливаем pending UNLOCK для немедленного применения
             * в updateOneDoor. Это предотвращает задержку до следующего цикла.
             */
            s_lockReq[idx].pending = 1U;
            s_lockReq[idx].lock_on = 0U;
            s_lockReq[idx].source = source;
            if (timeout_ms == 0U)
                s_lockReq[idx].expireMs = 0U;
            else
                s_lockReq[idx].expireMs = GetMs() + timeout_ms;
        }
        return 1U;
    }
    
    /* Случай 4: Дверь уже заблокирована, приходит команда LOCK */
    if (newLock && (doorLocked != 0U) && doorClosed)
    {
        /* Дверь уже заблокирована и закрыта - проверяем тип pending команды */
        if (hasPending)
        {
            if (!pendingLock)
            {
                /* Есть pending UNLOCK - отменяем его командой LOCK */
                s_lockReq[idx].pending = 1U;
                s_lockReq[idx].lock_on = 1U;
                s_lockReq[idx].source = source;
                if (timeout_ms == 0U)
                    s_lockReq[idx].expireMs = 0U;
                else
                    s_lockReq[idx].expireMs = GetMs() + timeout_ms;
            }
            else
            {
                /* Есть pending LOCK для уже заблокированной двери - 
                 * обновляем только TTL, не перезаписываем команду.
                 * Это предотвращает ненужные переключения при keepalive командах.
                 */
                if (timeout_ms == 0U)
                    s_lockReq[idx].expireMs = 0U;
                else
                    s_lockReq[idx].expireMs = GetMs() + timeout_ms;
            }
        }
        else
        {
        }
        return 1U;
    }
    
    /* Для всех остальных случаев перезаписываем команду */
    s_lockReq[idx].pending  = 1U;
    s_lockReq[idx].lock_on  = newLock;
    s_lockReq[idx].source   = source;

    if (timeout_ms == 0U)
        s_lockReq[idx].expireMs = 0U;
    else
        s_lockReq[idx].expireMs = GetMs() + timeout_ms;


    return 1U;
}

uint8_t Doors_GetState(uint8_t door_id, AppDoorState_t *out)
{
    if (!out) return 0U;
    if (door_id == 0U || door_id > APP_DOOR_MAX) return 0U;

    /* Инициализируем мьютекс, если еще не создан */
    if (!s_doors_mutex) {
        s_doors_mutex = xSemaphoreCreateMutex();
        if (!s_doors_mutex) return 0U; /* Не удалось создать мьютекс */
    }

    /* Захватываем мьютекс для безопасного чтения */
    if (xSemaphoreTake(s_doors_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return 0U; /* Таймаут при захвате мьютекса */
    }

    uint8_t idx = (uint8_t)(door_id - 1U);
    *out = s_doors[idx];

    /* Освобождаем мьютекс */
    xSemaphoreGive(s_doors_mutex);

    return 1U;
}

void Doors_TaskInit(void)
{
    /* ВАЖНО: Сохраняем таймауты перед обнулением структур!
     * Таймауты могут быть установлены из конфигурации ДО запуска этой задачи
     * (через ConfigService_InitOnBoot() -> DoorsCfg_SetPostCloseTimeoutMs()).
     * Если их не сохранить, они будут потеряны при memset.
     */
    uint32_t savedPostCloseTimeouts[APP_DOOR_MAX];
    for (uint8_t i = 0; i < APP_DOOR_MAX; i++) {
        savedPostCloseTimeouts[i] = s_doors[i].postCloseTimeoutMs;
    }
    uint32_t savedOpenTimeout = s_cfgOpenTimeoutMs;
    
    memset(s_doors, 0, sizeof(s_doors));
    memset(s_prevAlarmRaw, 0, sizeof(s_prevAlarmRaw));
    memset(s_lastAlarmEdgeMs, 0, sizeof(s_lastAlarmEdgeMs));
    memset(s_lastBlinkMs, 0, sizeof(s_lastBlinkMs));
    memset(s_blinkPhase, 0, sizeof(s_blinkPhase));
    memset(s_lockSavedBeforeAlarm, 0, sizeof(s_lockSavedBeforeAlarm));
    memset(s_lockReq, 0, sizeof(s_lockReq));

    /* Инициализируем мьютекс для синхронизации доступа к данным дверей */
    if (!s_doors_mutex) {
        s_doors_mutex = xSemaphoreCreateMutex();
    }

    /* Восстанавливаем таймауты из конфигурации (если они были установлены) */
    s_cfgOpenTimeoutMs = savedOpenTimeout;
    for (uint8_t i = 0; i < APP_DOOR_MAX; i++) {
        s_doors[i].postCloseTimeoutMs = savedPostCloseTimeouts[i];
    }
    
    for (uint8_t i = 0; i < APP_DOOR_MAX; i++) {
        if (s_doors[i].postCloseTimeoutMs != 0U) {
            /* postCloseTimeoutMs установлен */
        }
    }
}

/* ============================================================
   ЭТАП 4.5 — Сигнализация как система
   ------------------------------------------------------------
   Вводим причину сигнализации (bitmask) и правило:
     alarming = (alarmReasons != 0)

   Пояснение “почему так”:
   - manual Alarm и open-timeout могут совпасть во времени
   - выключение одной причины не должно выключать сигнализацию,
     если другая причина всё ещё активна
   - поэтому держим mask причин и считаем сигнализацию включенной,
     пока mask != 0.
   ============================================================ */

/* Обновляет фактический флаг alarming и выполняет вход/выход из сигнализации.
 *
 * Вход (alarming: 0->1):
 *   - запоминаем lock-state
 *   - принудительно unlock (сигнализация всегда unlock)
 *   - стартуем мигание (GREEN фаза)
 *   - публикуем EVT_DOOR_SIGNAL_ON с arg=mask причин
 *
 * Выход (alarming: 1->0):
 *   - выключаем buzzer
 *   - восстанавливаем lock-state (но инварианты применятся ниже)
 *   - публикуем EVT_DOOR_SIGNAL_OFF
 */
static void alarm_update(uint8_t door1based, uint8_t idx)
{
    uint8_t was = s_doors[idx].alarming;
    uint8_t now = (s_doors[idx].alarmReasons != DOOR_ALARM_NONE) ? 1U : 0U;

    if (!was && now)
    {
        /* ВХОД В СИГНАЛИЗАЦИЮ */
        
        s_lockSavedBeforeAlarm[idx] = s_doors[idx].locked;

        /* Любые внешние pending-команды не должны перебивать сигнализацию */
        s_lockReq[idx].pending = 0U;

        s_doors[idx].locked = 0U;
        DoorHAL_SetLock(door1based, false);

        s_blinkPhase[idx]  = 0U;
        s_lastBlinkMs[idx] = GetMs();

        publish_event(EVT_DOOR_SIGNAL_ON, door1based, s_doors[idx].alarmReasons);
    }
    else if (was && !now)
    {
        /* ВЫХОД ИЗ СИГНАЛИЗАЦИИ */
        DoorHAL_SetBuzzer(door1based, false);

        /* Восстанавливаем lock-state, который был до сигнализации */
        s_doors[idx].locked = s_lockSavedBeforeAlarm[idx];

        publish_event(EVT_DOOR_SIGNAL_OFF, door1based, 0U);
    }

    s_doors[idx].alarming = now;
}

static void alarm_add(uint8_t door1based, uint8_t idx, door_alarm_reason_t reason)
{
    s_doors[idx].alarmReasons |= (uint32_t)reason;
    alarm_update(door1based, idx);
}

static void alarm_remove(uint8_t door1based, uint8_t idx, door_alarm_reason_t reason)
{
    s_doors[idx].alarmReasons &= ~((uint32_t)reason);
    alarm_update(door1based, idx);
}

/* ============================================================
   Применение выходов
   ============================================================ */

/* Нормальный режим:
   - buzzer OFF
   - LED: RED если locked, иначе GREEN
   - LOCK применяем только если дверь физически закрыта (инвариант)
   - NC: при активном окне разблокировки — всегда unlock (зелёный) */
static void applyNormal(uint8_t door1based, bool physClosed, uint8_t idx)
{
    bool wantLock = (s_doors[idx].locked != 0U);
    bool wasLocked = wantLock;

    /* Инвариант безопасности: нельзя LOCK при открытой двери */
    if (!physClosed)
        wantLock = false;

    /* NC: активное окно разблокировки — принудительно unlock */
    if (door_is_nc_type(door1based) && physClosed && s_doors[idx].ncUnlockWindowEndMs != 0U)
    {
        uint32_t now = GetMs();
        if (now < s_doors[idx].ncUnlockWindowEndMs)
            wantLock = false;
    }

    /* ЛОГИРОВАНИЕ: изменение состояния замка на аппаратном уровне */
    if (wasLocked != wantLock)
    {
        /* Изменение состояния блокировки */
    }

    DoorHAL_SetLock(door1based, wantLock);
    DoorHAL_SetLed(door1based, wantLock ? DOOR_LED_RED : DOOR_LED_GREEN);
    DoorHAL_SetBuzzer(door1based, false);

    /* В состоянии отражаем фактически применённое */
    s_doors[idx].locked = (uint8_t)wantLock;
}

/* Сигнализация:
   - мигание R/G по 1с
   - buzzer в RED фазе
   - ВАЖНО: замок всегда UNLOCK */
static void applySignaling(uint8_t door1based, uint8_t idx)
{
    uint32_t now = GetMs();

    if ((now - s_lastBlinkMs[idx]) >= 1000U)
    {
        s_lastBlinkMs[idx] = now;
        s_blinkPhase[idx] ^= 1U;
    }

    bool redPhase = (s_blinkPhase[idx] != 0U);

    DoorHAL_SetLed(door1based, redPhase ? DOOR_LED_RED : DOOR_LED_GREEN);
    DoorHAL_SetBuzzer(door1based, redPhase);

    /* Сигнализация всегда держит дверь разблокированной */
    DoorHAL_SetLock(door1based, false);
    s_doors[idx].locked = 0U;
}

/* Есть ли запись о локальной двери в конфиге текущего узла */
static uint8_t door_is_in_local_config(uint8_t local_door_id)
{
    if (local_door_id < 1U || local_door_id > APP_DOOR_MAX) return 0U;
    uint8_t nodeId = System_GetNodeId();
    for (uint16_t i = 0; i < g_project_cfg.doorCount && i < CFG_MAX_DOORS; i++)
    {
        const cfg_door_t *d = &g_project_cfg.doors[i];
        if (d->nodeId == nodeId && d->localDoor == local_door_id)
            return 1U;
    }
    return 0U;
}

uint8_t Doors_IsLocalDoorConfigured(uint8_t local_door_id)
{
    return door_is_in_local_config(local_door_id);
}

/* Слот не в конфиге: сброс логики и безопасное «покой» на выходах (без сигнализации) */
static void door_deactivate_unused(uint8_t door1based, uint8_t idx)
{
    s_lockReq[idx].pending = 0U;
    s_doors[idx].openSinceMs = 0U;
    s_doors[idx].postClosePending = 0U;
    s_doors[idx].postCloseTimeoutMs = 0U;
    s_doors[idx].ncUnlockWindowEndMs = 0U;
    s_doors[idx].ncLockAfterCloseStartMs = 0U;
    s_doors[idx].ncLockAfterClosePending = 0U;
    s_ncAlarmLowStartMs[idx] = 0U;

    if (s_doors[idx].alarmReasons != DOOR_ALARM_NONE)
    {
        s_doors[idx].alarmReasons = DOOR_ALARM_NONE;
        alarm_update(door1based, idx);
    }
    else
    {
        s_doors[idx].alarming = 0U;
    }

    s_doors[idx].locked = 0U;
    s_doors[idx].alarmPressed = 0U;

    /* Синхронизируем кэш с датчиком — иначе UI показывает «Открыта» при закрытой двери */
    s_doors[idx].physClosed = (uint8_t)DoorHAL_IsClosed(door1based);

    DoorHAL_ApplySafeState(door1based);
}

void Doors_RefreshUnusedLocalSlots(void)
{
    if (!s_doors_mutex)
        return;

    for (uint8_t d = 1U; d <= APP_DOOR_MAX; d++)
    {
        if (door_is_in_local_config(d))
            continue;

        uint8_t idx = (uint8_t)(d - 1U);
        if (xSemaphoreTake(s_doors_mutex, pdMS_TO_TICKS(100)) == pdTRUE)
        {
            door_deactivate_unused(d, idx);
            xSemaphoreGive(s_doors_mutex);
        }
    }
}

uint8_t Doors_IsRuntimeReady(void)
{
    return (s_doors_mutex != NULL) ? 1U : 0U;
}

/* NC: проверка типа двери по конфигу (локальная дверь 1..8 на текущем узле) */
static uint8_t door_is_nc_type(uint8_t local_door_id)
{
    if (local_door_id < 1U || local_door_id > APP_DOOR_MAX) return 0U;
    uint8_t nodeId = System_GetNodeId();
    for (uint16_t i = 0; i < g_project_cfg.doorCount && i < CFG_MAX_DOORS; i++)
    {
        const cfg_door_t *d = &g_project_cfg.doors[i];
        if (d->nodeId == nodeId && d->localDoor == local_door_id)
            return (d->type == (uint8_t)DOOR_TYPE_NC) ? 1U : 0U;
    }
    return 0U;
}

/* ============================================================
   Основная логика по двери
   ============================================================ */

static void updateOneDoor(uint8_t door1based)
{
    uint8_t  idx = (uint8_t)(door1based - 1U);
    uint32_t now = GetMs();

    bool closed = DoorHAL_IsClosed(door1based);
    bool alarm  = DoorHAL_IsAlarmPressed(door1based);

    /* Захватываем мьютекс для безопасной записи в s_doors.
     * Используем ограниченный таймаут (50мс) вместо portMAX_DELAY,
     * чтобы не блокировать HTTP задачу на долгое время.
     * Если не удалось захватить - пропускаем обновление этой итерации.
     */
    if (s_doors_mutex) {
        if (xSemaphoreTake(s_doors_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
            return; /* Не удалось захватить мьютекс - пропускаем эту итерацию */
        }
    }

    /* Дверь не описана в конфиге узла — не запускаем таймауты, Alarm, post-close, NC */
    if (!door_is_in_local_config(door1based))
    {
        door_deactivate_unused(door1based, idx);
        if (s_doors_mutex)
            xSemaphoreGive(s_doors_mutex);
        return;
    }

    /* --------------------------------------------------------
     * 1) OPEN/CLOSE события
     * -------------------------------------------------------- */

    if (s_doors[idx].physClosed != (uint8_t)closed)
    {
        uint8_t wasClosed = s_doors[idx].physClosed;

        s_doors[idx].physClosed   = (uint8_t)closed;
        s_doors[idx].lastChangeMs = now;

        publish_event(closed ? EVT_DOOR_CLOSE : EVT_DOOR_OPEN, door1based, 0);

        if (!closed)
        {
           /* ===== ВХОД В OPEN ===== */

        	            /* ЭТАП 4.3: старт “сессии OPEN” для open-timeout */
        	            s_doors[idx].openSinceMs = now;

        	            /* ЭТАП 4.4: если дверь снова открылась до окончания post-close ожидания,
        	             * отменяем ожидание, чтобы потом НЕ прилетело "POST_CLOSE_READY" не к месту.
        	             */
        	            s_doors[idx].postClosePending = 0U;

        	            /* NC: при открытии сбрасываем окно разблокировки и задержку после закрытия */
        	            if (door_is_nc_type(door1based))
        	            {
        	                s_doors[idx].ncUnlockWindowEndMs = 0U;
        	                s_doors[idx].ncLockAfterCloseStartMs = 0U;
        	                s_doors[idx].ncLockAfterClosePending = 0U;
        	            }
        }
        else
        {
            /* Переход OPEN->CLOSE:
             * - по ТЗ сигнализация от OPEN timeout должна выключиться после закрытия
             * - manual Alarm остаётся, пока его не выключат кнопкой
             */
            if (!wasClosed)
            {
                /* ЭТАП 4.4: post-close delay */
                s_doors[idx].postCloseStartMs = now;

                if (s_doors[idx].postCloseTimeoutMs == 0U)
                {
                    s_doors[idx].postClosePending = 0U;
                    publish_event(EVT_DOOR_POST_CLOSE_READY, door1based, 0U);
                }
                else
                {
                    s_doors[idx].postClosePending = 1U;
                }

                /* NC: при переходе OPEN->CLOSE запускаем задержку блокировки после закрытия */
                if (door_is_nc_type(door1based))
                {
                    s_doors[idx].ncLockAfterCloseStartMs = now;
                    s_doors[idx].ncLockAfterClosePending = 1U;
                }
            }

            /* Снять причину OPEN_TIMEOUT при закрытии */
            alarm_remove(door1based, idx, DOOR_ALARM_OPEN_TIMEOUT);
        }
    }

    /* --------------------------------------------------------
     * 2) raw alarm state update (для совместимости / диагностики)
     * -------------------------------------------------------- */
    if (s_doors[idx].alarmPressed != (uint8_t)alarm)
    {
        s_doors[idx].alarmPressed = (uint8_t)alarm;
        s_doors[idx].lastChangeMs = now;
    }

    /* --------------------------------------------------------
     * 3) Manual Alarm toggle (локальный приоритет)
     * --------------------------------------------------------
     * NO: дребезг ~50 ms по фронту нажатия.
     * NC: импульс открывает окно разблокировки — ложные фронты от шума линии дают моргание LED
     * (applyNormal: в окне wantLock=0 → зелёный). Требуем стабильный «низ» ≥200 ms перед фронтом 0→1
     * и ≥200 ms между принятыми импульсами.
     *
     * Важно:
     * - EVT_DOOR_ALARM оставляем как “manual alarm state (1/0)”, как было раньше.
     * - Фактическая сигнализация теперь управляется через alarmReasons mask.
     */
    {
        const uint8_t is_nc = door_is_nc_type(door1based);
        if (is_nc != 0U) {
            if (!alarm) {
                if (s_ncAlarmLowStartMs[idx] == 0U) {
                    s_ncAlarmLowStartMs[idx] = now;
                }
            }
        }

        if (alarm != 0U && s_prevAlarmRaw[idx] == 0U)
        {
            const uint32_t edge_gap_ms = (is_nc != 0U) ? 200U : 50U;
            uint8_t accept = 0U;

            if ((now - s_lastAlarmEdgeMs[idx]) >= edge_gap_ms)
            {
                if (is_nc != 0U) {
                    const uint8_t low_ok = (s_ncAlarmLowStartMs[idx] != 0U) &&
                                           ((now - s_ncAlarmLowStartMs[idx]) >= 200U);
                    accept = low_ok ? 1U : 0U;
                } else {
                    accept = 1U;
                }
            }

            if (accept != 0U)
            {
                s_lastAlarmEdgeMs[idx] = now;

                if (is_nc != 0U)
                {
                    /* NC: импульс = окно разблокировки. Разблокировка только если LogicCore не требует блокировку. */
                    logic_core_t *lc = CommsTask_GetLogicCore();
                    uint8_t nodeId = System_GetNodeId();
                    uint8_t gid = GlobalDoorId_Make(nodeId, door1based);
                    if (lc && gid != 0U && !LogicCore_IsLockRequired(lc, gid))
                    {
                        s_doors[idx].ncUnlockWindowEndMs = now + s_cfgNcUnlockWindowMs; /* старт или продление окна */
                    }
                    s_ncAlarmLowStartMs[idx] = 0U; /* после принятого импульса ждём новый стабильный «низ» */
                }
                else
                {
                    uint8_t manualOn = (s_doors[idx].alarmReasons & DOOR_ALARM_MANUAL) ? 1U : 0U;
                    manualOn ^= 1U;

                    if (manualOn)
                        alarm_add(door1based, idx, DOOR_ALARM_MANUAL);
                    else
                        alarm_remove(door1based, idx, DOOR_ALARM_MANUAL);

                    publish_event(EVT_DOOR_ALARM, door1based, manualOn ? 1U : 0U);
                }
            }
        }

        /* Удержание Alarm=1: для NC сбрасываем отсчёт «низкого», чтобы после отпускания начать заново. */
        if (is_nc != 0U && alarm != 0U) {
            s_ncAlarmLowStartMs[idx] = 0U;
        }
    }
    s_prevAlarmRaw[idx] = (uint8_t)alarm;

    /* --------------------------------------------------------
     * 4) ЭТАП 4.3: OPEN timeout
     * --------------------------------------------------------
     * Тайм-аут общий для всех дверей (конфиг).
     * При превышении:
     *  - включается сигнализация (причина DOOR_ALARM_OPEN_TIMEOUT)
     *  - публикуем EVT_DOOR_OPEN_TIMEOUT
     *
     * Снятие причины:
     *  - по закрытию двери (см. блок OPEN->CLOSE выше)
     */
    if (!closed)
    {
        uint32_t t = s_cfgOpenTimeoutMs;

        if ((t != 0U) && ((s_doors[idx].alarmReasons & DOOR_ALARM_OPEN_TIMEOUT) == 0U))
        {
            /* если openSinceMs ещё не инициализирован (например после reset) */
            if (s_doors[idx].openSinceMs == 0U)
                s_doors[idx].openSinceMs = now;

            uint32_t elapsed = now - s_doors[idx].openSinceMs;
            if (elapsed >= t)
            {
                alarm_add(door1based, idx, DOOR_ALARM_OPEN_TIMEOUT);
                publish_event(EVT_DOOR_OPEN_TIMEOUT, door1based, 0U);
            }
        }
    }

    /* --------------------------------------------------------
     * 5) ЭТАП 4.4: POST-CLOSE pending → READY
     * -------------------------------------------------------- */
    if (s_doors[idx].postClosePending)
    {
        uint32_t t = s_doors[idx].postCloseTimeoutMs;

        if (t == 0U)
        {
            /* “на всякий случай”: если конфиг поменяли на лету */
            s_doors[idx].postClosePending = 0U;
            publish_event(EVT_DOOR_POST_CLOSE_READY, door1based, 0U);
        }
        else
        {
            uint32_t elapsed = now - s_doors[idx].postCloseStartMs;
            if (elapsed >= t)
            {
                s_doors[idx].postClosePending = 0U;
                publish_event(EVT_DOOR_POST_CLOSE_READY, door1based, 0U);
            }
        }
    }

    /* --------------------------------------------------------
     * 5b) NC: истечение окна разблокировки и задержка блокировки после закрытия.
     *     Также: NC закрытая без активного окна и без pending задержки — заблокирована
     *     (старт/применение конфига без перехода OPEN→CLOSE).
     * -------------------------------------------------------- */
    if (door_is_nc_type(door1based) && closed)
    {
        if (s_doors[idx].ncUnlockWindowEndMs != 0U && now > s_doors[idx].ncUnlockWindowEndMs)
        {
            s_doors[idx].locked = 1U;
            s_doors[idx].ncUnlockWindowEndMs = 0U;
            s_doors[idx].lastChangeMs = now;
        }
        if (s_doors[idx].ncLockAfterClosePending)
        {
            uint32_t delay = s_cfgNcLockDelayAfterCloseMs;
            if (delay == 0U || (now - s_doors[idx].ncLockAfterCloseStartMs) >= delay)
            {
                s_doors[idx].locked = 1U;
                s_doors[idx].ncLockAfterClosePending = 0U;
                s_doors[idx].ncLockAfterCloseStartMs = 0U;
                s_doors[idx].lastChangeMs = now;
            }
        }
        /* NC закрытая, нет активного окна разблокировки — безопасное состояние: замок */
        if ((s_doors[idx].ncUnlockWindowEndMs == 0U || now >= s_doors[idx].ncUnlockWindowEndMs) &&
            !s_doors[idx].ncLockAfterClosePending)
        {
            s_doors[idx].locked = 1U;
            s_doors[idx].lastChangeMs = now;
        }
    }

    /* --------------------------------------------------------
     * 6) Применение внешних команд lock/unlock (если не в сигнализации)
     * --------------------------------------------------------
     * Правило:
     * - пока сигнализация активна (любая причина) — внешние lock команды отбрасываем.
     * - это обеспечивает “Alarm выше внешних команд” и предсказуемость.
     * 
     * ВАЖНО: команда блокировки для открытой двери не применяется сразу,
     * но сохраняется, чтобы применить её сразу после закрытия двери.
     * Это предотвращает "дергание" замка при открытой двери.
     */
    if (!s_doors[idx].alarming)
    {
        if (s_lockReq[idx].pending)
        {
            /* TTL check */
            if ((s_lockReq[idx].expireMs != 0U) && (now > s_lockReq[idx].expireMs))
            {
                s_lockReq[idx].pending = 0U;
            }
            else
            {
                /* Не применять лишний UNLOCK, если дверь уже разблокирована и нет pending LOCK. */
                if (!s_lockReq[idx].lock_on)
                {
                    /* Команда unlock от LogicCore.
                     * Для NC-двери закрытой без активного окна разблокировки — не применяем,
                     * замок остаётся (управляется блоком 5b и окном NC).
                     */
                    if (door_is_nc_type(door1based) && closed &&
                        (s_doors[idx].ncUnlockWindowEndMs == 0U || now >= s_doors[idx].ncUnlockWindowEndMs))
                    {
                        /* Игнорируем unlock; NC закрытая должна быть заблокирована.
                         * Явно ставим locked=1: при загрузке конфига LOCK от apply_cfg_runtime
                         * мог быть перезаписан UNLOCK от LogicCore до применения в цикле. */
                        s_doors[idx].locked = 1U;
                        s_doors[idx].lastChangeMs = now;
                        s_lockReq[idx].pending = 0U;
                    }
                    else if (s_doors[idx].locked != 0U)
                    {
                        /* Дверь заблокирована - разблокируем */
                        s_doors[idx].locked = 0U;
                        s_doors[idx].lastChangeMs = now;
                        s_lockReq[idx].pending = 0U;
                    }
                    else
                    {
                        /* Дверь уже разблокирована - просто сбрасываем pending команду */
                        s_lockReq[idx].pending = 0U;
                    }
                }
                /* Команда lock применяется только если дверь закрыта */
                else if (closed)
                {
                    s_doors[idx].locked = 1U;
                    s_doors[idx].lastChangeMs = now;
                    s_lockReq[idx].pending = 0U;
                }
                /* Если дверь открыта и команда lock - сохраняем команду,
                 * но не применяем её до закрытия двери (предотвращает "дергание")
                 */
                /* else: дверь открыта, команда lock остается pending до закрытия */
            }
        }
    }
    else
    {
        /* Сигнализация выше всех: отбрасываем внешние команды */
        s_lockReq[idx].pending = 0U;
    }

    /* --------------------------------------------------------
     * 7) Выходы: normal / signaling
     * -------------------------------------------------------- */
    if (s_doors[idx].alarming)
        applySignaling(door1based, idx);
    else
        applyNormal(door1based, closed, idx);

    /* Hard safety invariant: if open -> always unlock (поверх всего) */
    if (!closed)
    {
        if (s_doors[idx].locked != 0U)
        {
        }
        DoorHAL_SetLock(door1based, false);
        s_doors[idx].locked = 0U;
        
        /* Команда блокировки для открытой двери остается pending,
         * чтобы применить её сразу после закрытия двери.
         * Это предотвращает задержку блокировки до следующего CAN обновления.
         */
    }
    else
    {
        /* Дверь закрылась - проверяем, есть ли pending команда блокировки */
        if (s_lockReq[idx].pending && s_lockReq[idx].lock_on && !s_doors[idx].alarming)
        {
            /* Применяем команду блокировки, которая была отложена */
            s_doors[idx].locked = 1U;
            s_doors[idx].lastChangeMs = now;
            s_lockReq[idx].pending = 0U;
        }
    }
    
    /* ЛОГИРОВАНИЕ: финальное состояние после обработки - удалено для уменьшения шума в логах */

    /* Освобождаем мьютекс */
    if (s_doors_mutex) {
        xSemaphoreGive(s_doors_mutex);
    }
}

void DoorsTask_Run(void const *argument)
{
    (void)argument;

    Doors_TaskInit();

    /* ЭТАП 3: аппаратная модель двери */
    DoorHAL_Init();

    /* ВАЖНО: Инициализируем physClosed правильным значением для всех дверей
     * ДО первого вызова updateOneDoor(). Это предотвращает ложное срабатывание
     * post-close таймаута для уже закрытых дверей при старте.
     * 
     * Если не сделать это, то при первом updateOneDoor() для закрытой двери
     * система увидит переход 0->1 и запустит post-close таймаут, даже если
     * дверь уже была закрыта до старта.
     */
    for (uint8_t d = 1; d <= APP_DOOR_MAX; d++) {
        uint8_t idx = (uint8_t)(d - 1U);
        bool closed = DoorHAL_IsClosed(d);
        s_doors[idx].physClosed = (uint8_t)closed;
        /* Не публикуем события при инициализации - это не реальные переходы */
    }

    /* Применяем конфигурацию после инициализации задачи
     * Это гарантирует, что таймауты установлены даже если конфигурация
     * применялась ДО запуска этой задачи (и была сохранена в Doors_TaskInit)
     * или если конфигурация применяется ПОСЛЕ запуска задачи.
     */
    extern project_config_t g_project_cfg;
    ConfigService_ApplyRuntime(&g_project_cfg);

    uint8_t post_boot_persist_done = 0U;

    for (;;)
    {
        AppHealth_Heartbeat(TASK_DOOR);

        for (uint8_t d = 1; d <= APP_DOOR_MAX; d++)
            updateOneDoor(d);

        /* После первого цикла опроса датчиков — фоновая запись v2, если был v1 в flash */
        if (!post_boot_persist_done) {
            post_boot_persist_done = 1U;
            ConfigService_PostBootPersistIfNeeded();
        }

        osDelay(20);
    }
}
