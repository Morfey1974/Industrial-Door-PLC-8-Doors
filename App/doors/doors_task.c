#include "doors_task.h"

#include <string.h>
#include <stdbool.h>

#include "cmsis_os.h"
#include "main.h"

#include "door_hal.h"

/* Stage-2 system */
#include "system/app_events.h"
#include "system/app_health.h"

#include "FreeRTOS.h"
#include "task.h"

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

/* ------------------------------------------------------------
   Локальные сервисные состояния (не “модель двери”, а служебные переменные)
   ------------------------------------------------------------ */

static uint8_t  s_prevAlarmRaw[APP_DOOR_MAX];
static uint32_t s_lastAlarmEdgeMs[APP_DOOR_MAX];

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

/* ============================================================
   Вспомогательные функции
   ============================================================ */

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
    s_cfgOpenTimeoutMs = timeout_ms;
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

/* ============================================================
   Публичное API состояния/управления
   ============================================================ */

AppDoorState_t* Doors_GetStateArray(void)
{
    return s_doors;
}

uint8_t Doors_RequestLock(uint8_t door_id, uint8_t lock_on, uint32_t source, uint32_t timeout_ms)
{
    if (door_id == 0U || door_id > APP_DOOR_MAX) return 0U;

    uint8_t idx = (uint8_t)(door_id - 1U);

    /* Приоритет сигнализации:
     * если сигнализация активна (любая причина) — внешние команды отвергаем.
     */
    if (s_doors[idx].alarming)
        return 0U;

    s_lockReq[idx].pending  = 1U;
    s_lockReq[idx].lock_on  = (lock_on != 0U) ? 1U : 0U;
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

    uint8_t idx = (uint8_t)(door_id - 1U);
    *out = s_doors[idx];
    return 1U;
}

void Doors_TaskInit(void)
{
    memset(s_doors, 0, sizeof(s_doors));
    memset(s_prevAlarmRaw, 0, sizeof(s_prevAlarmRaw));
    memset(s_lastAlarmEdgeMs, 0, sizeof(s_lastAlarmEdgeMs));
    memset(s_lastBlinkMs, 0, sizeof(s_lastBlinkMs));
    memset(s_blinkPhase, 0, sizeof(s_blinkPhase));
    memset(s_lockSavedBeforeAlarm, 0, sizeof(s_lockSavedBeforeAlarm));
    memset(s_lockReq, 0, sizeof(s_lockReq));

    /* Конфиг по умолчанию:
     * - open timeout выключен
     * - post-close timeout = 0 (реакция “готово” сразу)
     */
    s_cfgOpenTimeoutMs = 0U;
    for (uint8_t i = 0; i < APP_DOOR_MAX; i++)
        s_doors[i].postCloseTimeoutMs = 0U;
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
   - LOCK применяем только если дверь физически закрыта (инвариант) */
static void applyNormal(uint8_t door1based, bool physClosed, uint8_t idx)
{
    bool wantLock = (s_doors[idx].locked != 0U);

    /* Инвариант безопасности: нельзя LOCK при открытой двери */
    if (!physClosed)
        wantLock = false;

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

/* ============================================================
   Основная логика по двери
   ============================================================ */

static void updateOneDoor(uint8_t door1based)
{
    uint8_t  idx = (uint8_t)(door1based - 1U);
    uint32_t now = GetMs();

    bool closed = DoorHAL_IsClosed(door1based);
    bool alarm  = DoorHAL_IsAlarmPressed(door1based);

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
     * Дребезг ~50ms, срабатывание по фронту нажатия.
     *
     * Важно:
     * - EVT_DOOR_ALARM оставляем как “manual alarm state (1/0)”, как было раньше.
     * - Фактическая сигнализация теперь управляется через alarmReasons mask.
     */
    if (alarm && !s_prevAlarmRaw[idx])
    {
        if ((now - s_lastAlarmEdgeMs[idx]) >= 50U)
        {
            s_lastAlarmEdgeMs[idx] = now;

            uint8_t manualOn = (s_doors[idx].alarmReasons & DOOR_ALARM_MANUAL) ? 1U : 0U;
            manualOn ^= 1U;

            if (manualOn)
                alarm_add(door1based, idx, DOOR_ALARM_MANUAL);
            else
                alarm_remove(door1based, idx, DOOR_ALARM_MANUAL);

            publish_event(EVT_DOOR_ALARM, door1based, manualOn ? 1U : 0U);
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

            if ((now - s_doors[idx].openSinceMs) >= t)
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
            if ((now - s_doors[idx].postCloseStartMs) >= t)
            {
                s_doors[idx].postClosePending = 0U;
                publish_event(EVT_DOOR_POST_CLOSE_READY, door1based, 0U);
            }
        }
    }

    /* --------------------------------------------------------
     * 6) Применение внешних команд lock/unlock (если не в сигнализации)
     * --------------------------------------------------------
     * Правило:
     * - пока сигнализация активна (любая причина) — внешние lock команды отбрасываем.
     * - это обеспечивает “Alarm выше внешних команд” и предсказуемость.
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
                /* Apply request to the model. Invariants are enforced below. */
                s_doors[idx].locked = s_lockReq[idx].lock_on ? 1U : 0U;
                s_doors[idx].lastChangeMs = now;
                s_lockReq[idx].pending = 0U;
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
        DoorHAL_SetLock(door1based, false);
        s_doors[idx].locked = 0U;
    }
}

void DoorsTask_Run(void const *argument)
{
    (void)argument;

    Doors_TaskInit();

    /* ЭТАП 3: аппаратная модель двери */
    DoorHAL_Init();

    for (;;)
    {
        AppHealth_Heartbeat(TASK_DOOR);

        for (uint8_t d = 1; d <= APP_DOOR_MAX; d++)
            updateOneDoor(d);

        osDelay(20);
    }
}
