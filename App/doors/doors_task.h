#pragma once

#include <stdint.h>

#ifndef APP_DOOR_MAX
#define APP_DOOR_MAX 8
#endif

/* =========================================================
 * ЭТАП 4.5 — Причины сигнализации (по глобальному плану)
 *
 * Важно:
 * - Сигнализация — это не "одна кнопка".
 * - Сигнализация может включаться по нескольким причинам:
 *   - manual (кнопка Alarm)
 *   - open timeout (дверь открыта слишком долго)
 *   - (на будущее) fault/degraded и т.п.
 *
 * Правило:
 *   сигнализация активна, если mask != 0.
 *   выключается только когда сняты ВСЕ причины.
 * ========================================================= */
typedef enum
{
    DOOR_ALARM_NONE          = 0U,
    DOOR_ALARM_MANUAL        = (1U << 0), /* кнопка ALARM */
    DOOR_ALARM_OPEN_TIMEOUT  = (1U << 1)  /* открыта слишком долго */
    /* reserved:
       DOOR_ALARM_FAULT      = (1U << 2),
       DOOR_ALARM_DEGRADED   = (1U << 3),
    */
} door_alarm_reason_t;

typedef struct
{
    /* ---------------------------------------------------------
     * Базовые состояния двери (Этап 3)
     * --------------------------------------------------------- */
    uint8_t physClosed;      // 1 = закрыта по датчику
    uint8_t alarmPressed;    // 1 = Alarm нажата (сырое чтение)
    uint8_t locked;          // 1 = замок активирован (фактически выставлено)
    uint8_t alarming;        // 1 = режим сигнализации активен (mask != 0)

    /* ---------------------------------------------------------
     * ЭТАП 4.5: причины сигнализации
     * ---------------------------------------------------------
     * alarmReasons — битовая маска door_alarm_reason_t.
     * Пример:
     *   - manual ON: alarmReasons |= DOOR_ALARM_MANUAL
     *   - open timeout: alarmReasons |= DOOR_ALARM_OPEN_TIMEOUT
     * Сигнализация включена, если alarmReasons != 0.
     */
    uint32_t alarmReasons;

    /* ---------------------------------------------------------
     * ЭТАП 4.3: тайм-аут открытой двери (общий)
     * ---------------------------------------------------------
     * openSinceMs — момент входа в OPEN (для измерения длительности open).
     */
    uint32_t openSinceMs;

    /* ---------------------------------------------------------
     * ЭТАП 4.4: тайм-аут после закрытия (индивидуально на дверь)
     * --------------------------------------------------------- */
    uint8_t  postClosePending;   /* 1 = ждём post-close delay */
    uint8_t  _rsvd8;
    uint16_t _rsvd16;

    uint32_t postCloseStartMs;
    uint32_t postCloseTimeoutMs; /* конфиг на дверь */

    /* NC-дверь: окно разблокировки и задержка блокировки после закрытия */
    uint32_t ncUnlockWindowEndMs;       /* 0 = окно не активно; иначе момент окончания окна */
    uint32_t ncLockAfterCloseStartMs;   /* 0 = не ждём; иначе начало отсчёта задержки */
    uint8_t  ncLockAfterClosePending;   /* 1 = ожидание блокировки после закрытия */
    uint8_t  _rsvd_nc;

    /* Временная отметка изменения “чего-то важного” (по месту использования) */
    uint32_t lastChangeMs;

} AppDoorState_t;

void Doors_TaskInit(void);

/**
 * Реальная “тело-задачи” дверей.
 * Важно: НЕ называем StartDoorsTask, чтобы не конфликтовать с CubeMX freertos.c
 */
void DoorsTask_Run(void const *argument);

/* Для других модулей (Logic Core / протоколы) */
AppDoorState_t* Doors_GetStateArray(void);

/**
 * Получить указатель на массив состояний дверей с захватом мьютекса.
 * ВАЖНО: После использования необходимо вызвать Doors_ReleaseStateArray().
 * Возвращает NULL если не удалось захватить мьютекс.
 */
AppDoorState_t* Doors_GetStateArrayLocked(void);

/**
 * Освободить мьютекс, захваченный Doors_GetStateArrayLocked().
 */
void Doors_ReleaseStateArray(void);

/**
 * Запросить (пере)установку замка для двери.
 * - door_id: 1..APP_DOOR_MAX
 * - lock_on: 1 = lock, 0 = unlock
 * - source: произвольный код источника (обычно app_event_source_t)
 * - timeout_ms: TTL команды (0 = без TTL). По истечению TTL команда отбрасывается.
 *
 * Возвращает 1 если команда принята (поставлена как pending), иначе 0.
 *
 * Важно:
 * - инвариант безопасности “не lock при открытой двери” соблюдается внутри doors_task.
 * - при активной сигнализации (alarming=1) внешние команды отвергаются (приоритет сигнализации).
 */
uint8_t Doors_RequestLock(uint8_t door_id, uint8_t lock_on, uint32_t source, uint32_t timeout_ms);

/**
 * Получить копию состояния двери.
 * Возвращает 1 если door_id корректен.
 */
uint8_t Doors_GetState(uint8_t door_id, AppDoorState_t *out);

/* =========================================================
 * ЭТАП 4.3/4.4 — Заготовка конфигурации тайм-аутов
 *
 * Сейчас конфигурация будет приходить из WEB-конфигуратора.
 * Пока здесь “RAM-заготовка” + API, чтобы:
 *  - можно было подменить значения в тесте;
 *  - потом подключить WEB без переделки логики door_task.
 * ========================================================= */

/* Общий open-timeout (для всех дверей), 0 = выключено */
uint8_t  DoorsCfg_SetOpenTimeoutMs(uint32_t timeout_ms);
uint32_t DoorsCfg_GetOpenTimeoutMs(void);

/* post-close timeout индивидуальный на дверь, 0 = применить немедленно */
uint8_t  DoorsCfg_SetPostCloseTimeoutMs(uint8_t door_id, uint32_t timeout_ms);
uint32_t DoorsCfg_GetPostCloseTimeoutMs(uint8_t door_id);

/* NC-дверь: окно разблокировки и задержка блокировки после закрытия (глобальные) */
uint8_t  DoorsCfg_SetNcUnlockWindowMs(uint32_t ms);
uint32_t DoorsCfg_GetNcUnlockWindowMs(void);
uint8_t  DoorsCfg_SetNcLockDelayAfterCloseMs(uint32_t ms);
uint32_t DoorsCfg_GetNcLockDelayAfterCloseMs(void);

/**
 * Есть ли локальная дверь (1..APP_DOOR_MAX) в активной конфигурации текущего узла.
 * Слоты без записи в g_project_cfg не обрабатываются DoorTask (нет таймаутов, сигнализации, NC).
 */
uint8_t Doors_IsLocalDoorConfigured(uint8_t local_door_id);

/**
 * Сбросить неиспользуемые локальные слоты после применения конфигурации.
 * Вызывается из ConfigService_ApplyRuntime().
 */
void Doors_RefreshUnusedLocalSlots(void);

/** 1 — doorsTask создала мьютекс (после Doors_TaskInit), можно трогать замки/HAL. */
uint8_t Doors_IsRuntimeReady(void);
