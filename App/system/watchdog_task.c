#include "watchdog_task.h"

#include "cmsis_os.h"
#include "app_health.h"
#include "app_events.h"

/* Опционально подключается аппаратный IWDG */
#ifdef USE_IWDG
#include "iwdg.h"
extern IWDG_HandleTypeDef hiwdg;
#endif

void WatchdogTask_Run(void const *argument)
{
    (void)argument;

    for (;;)
    {
        /* 1) SW-watchdog: следим, что Supervisor жив */
        if (!AppHealth_IsAlive(TASK_SUPERVISOR))
        {
            app_event_t evt = {
                .type = EVT_SYSTEM_FAULT,
                .source = APP_SRC_WATCHDOG,
                .door_id = 0,
                ._rsvd8 = 0,
                .flags = 0,
                .arg = 0,
                .ttl_ms = 0,
                .timestamp = xTaskGetTickCount(),
            };
            (void)AppEvents_Publish(&evt, 0);
        }

#ifdef USE_IWDG
        /* 2) HW IWDG: подкармливаем только если критические задачи живы */
        if (AppHealth_IsAlive(TASK_DOOR) &&
            AppHealth_IsAlive(TASK_LOGIC_CORE) &&
            AppHealth_IsAlive(TASK_NET))
        {
            (void)HAL_IWDG_Refresh(&hiwdg);
        }
#endif

        AppHealth_Heartbeat(TASK_WATCHDOG);
        osDelay(100);
    }
}
