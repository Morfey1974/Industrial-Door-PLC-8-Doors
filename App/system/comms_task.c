#include "comms_task.h"

#include <stdio.h>
#include <string.h>
#include <stdarg.h>

#include "cmsis_os.h"

#include "app_health.h"
#include "app_events.h"
#include "app_log.h"

#include "doors/doors_task.h"
#include "main.h"   // HAL_GetTick()

/* ============================================================
 * ВАЖНО: подключаем LogicCore.
 * ============================================================ */
#include "logic/logic_core.h"

/* ============================================================
 * Logic Core instance (MASTER only).
 * Хранится на уровне файла, т.к. используется в обработке событий.
 * ============================================================ */
static logic_core_t g_lc;

/* См. comms_task.h */
logic_core_t* CommsTask_GetLogicCore(void)
{
    return &g_lc;
}

/*
 * CommsTask (LOGIC CORE):
 * - читает EventBus (AppEvents_Wait)
 * - все события сначала передаёт в LogicCore_OnEvent()
 * - логирует события (пока только лог)
 * - команды EVT_CMD_LOCK/UNLOCK отправляет в LogicCore_SubmitManualLockCmd()
 *
 * ВАЖНО: post-close timeout (Этап 4.4) живёт в DoorTask,
 * потому что именно DoorTask держит таймер и публикует EVT_DOOR_POST_CLOSE_READY.
 */

static void app_logf(const char *fmt, ...)
{
    app_log_msg_t m;
    m.timestamp = (uint32_t)xTaskGetTickCount();

    va_list ap;
    va_start(ap, fmt);
    vsnprintf(m.text, sizeof(m.text), fmt, ap);
    va_end(ap);

    (void)AppLog_Push(&m, 0);
}

static uint8_t source_prio(app_event_source_t s)
{
    switch (s)
    {
        case APP_SRC_DOOR_LOCAL: return 250;
        case APP_SRC_SUPERVISOR: return 240;
        case APP_SRC_WATCHDOG:   return 240;

        case APP_SRC_CAN:        return 200;
        case APP_SRC_RS485:      return 150;
        case APP_SRC_HTTP:       return 100;

        default:                 return 0;
    }
}

void CommsTask_Run(void const *argument)
{
    (void)argument;

    /* per-door last accepted command priority (простая защита от "низких" команд) */
    static uint8_t s_lastCmdPrio[APP_DOOR_MAX] = {0};

    /* ============================================================
     * Инициализируем LogicCore один раз при старте.
     * ============================================================ */
    LogicCore_Init(&g_lc);

    /* ============================================================
     * ВРЕМЕННЫЕ тестовые настройки до WEB-конфига:
     * 1) OPEN timeout (Этап 4.3): общий для всех дверей
     *    -> DoorTask сам сгенерирует EVT_DOOR_OPEN_TIMEOUT и включит сигнализацию.
     * 2) Post-close timeout (Этап 4.4): индивидуальный для каждой двери
     *    -> DoorTask удержит событие и опубликует EVT_DOOR_POST_CLOSE_READY по таймеру.
     *
     * ВАЖНО: эти параметры позже будут задаваться из конфигурации (WEB).
     * ============================================================ */
// DoorsCfg_SetOpenTimeoutMs(5000U);            /* 5 сек, чтобы проверить сигнализацию */
// DoorsCfg_SetPostCloseTimeoutMs(1U, 3000U);   /* Door1: 3 сек задержка после CLOSE */

    for (;;)
    {
        AppHealth_Heartbeat(TASK_LOGIC_CORE);

        app_event_t evt;
        if (AppEvents_Wait(&evt, pdMS_TO_TICKS(200)) != pdTRUE)
        {
            /* Нет событий — проверяем таймауты разблокировки целевых дверей.
             * Это нужно, чтобы разблокировать двери после истечения post-close таймаута,
             * даже если нет других событий.
             */
            LogicCore_RecomputeAndApply(&g_lc);
            continue;
        }

        /* ============================================================
         * КЛЮЧЕВОЕ ПО ПЛАНУ:
         * Любое событие сначала передаём в LogicCore,
         * чтобы он вёл "снимок состояния" и применял зависимости/тайм-ауты.
         * ============================================================ */
        LogicCore_OnEvent(&g_lc, &evt);

        /* ============================================================
         * Дальше — только логирование/мониторинг + обработка ручных команд.
         * ============================================================ */
        switch (evt.type)
        {
            case EVT_DOOR_OPEN:
                app_logf("Door%u: OPEN (src=%u)", (unsigned)evt.door_id, (unsigned)evt.source);
                break;

            case EVT_DOOR_CLOSE:
                app_logf("Door%u: CLOSE (src=%u)", (unsigned)evt.door_id, (unsigned)evt.source);
                break;

            case EVT_DOOR_ALARM:
                app_logf("Door%u: ALARM=%u (src=%u)",
                         (unsigned)evt.door_id,
                         (unsigned)(evt.arg != 0U),
                         (unsigned)evt.source);

                /* Alarm всегда выше всех: сбрасываем память приоритета ручных команд для этой двери */
                if (evt.door_id >= 1U && evt.door_id <= APP_DOOR_MAX)
                    s_lastCmdPrio[evt.door_id - 1U] = 0U;
                break;

            case EVT_DOOR_OPEN_TIMEOUT:
                app_logf("Door%u: OPEN_TIMEOUT (src=%u)", (unsigned)evt.door_id, (unsigned)evt.source);
                break;

            case EVT_DOOR_POST_CLOSE_READY:
                app_logf("Door%u: POST_CLOSE_READY (src=%u)", (unsigned)evt.door_id, (unsigned)evt.source);
                break;

            case EVT_CMD_LOCK:
            case EVT_CMD_UNLOCK:
            {
                uint8_t door_id = evt.door_id;

                if (door_id == 0U || door_id > APP_DOOR_MAX)
                {
                    app_logf("CMD: invalid door_id=%u (src=%u)", (unsigned)door_id, (unsigned)evt.source);
                    break;
                }

                uint8_t prio = source_prio(evt.source);

                /* Низкоприоритетные команды не перебивают уже принятую высокоприоритетную */
                if (prio < s_lastCmdPrio[door_id - 1U])
                {
                    app_logf("CMD: drop %s Door%u (src=%u prio=%u < %u)",
                             (evt.type == EVT_CMD_LOCK) ? "LOCK" : "UNLOCK",
                             (unsigned)door_id, (unsigned)evt.source,
                             (unsigned)prio, (unsigned)s_lastCmdPrio[door_id - 1U]);
                    break;
                }

                /* ============================================================
                 * ВАЖНО: ручные команды идут ЧЕРЕЗ LogicCore,
                 * а не напрямую в Doors_RequestLock().
                 * ============================================================ */
                uint8_t ok = LogicCore_SubmitManualLockCmd(
                    &g_lc,
                    door_id,                                /* localDoor 1..8 */
                    (evt.type == EVT_CMD_LOCK) ? 1U : 0U,   /* lock_on */
                    evt.source,
                    evt.ttl_ms
                );

                if (ok)
                {
                    s_lastCmdPrio[door_id - 1U] = prio;
                    app_logf("CMD: %s Door%u accepted (src=%u ttl=%lums)",
                             (evt.type == EVT_CMD_LOCK) ? "LOCK" : "UNLOCK",
                             (unsigned)door_id, (unsigned)evt.source, (unsigned long)evt.ttl_ms);
                }
                else
                {
                    app_logf("CMD: %s Door%u rejected (src=%u)",
                             (evt.type == EVT_CMD_LOCK) ? "LOCK" : "UNLOCK",
                             (unsigned)door_id, (unsigned)evt.source);
                }
            } break;

            default:
                /* пока игнорируем остальное */
                break;
        }
    }
}
