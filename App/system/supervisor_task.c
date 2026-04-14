#include "supervisor_task.h"

#include "cmsis_os.h"
#include "app_health.h"
#include "bsp_doors_io.h"

/*
 * SupervisorTask:
 * - следит за heartbeat задач
 * - при проблеме — safe-state (unlock + buzzer off на дверях 1–2; LED не трогаем — см. комментарий в цикле)
 *
 * Примечание:
 * аппаратный IWDG можно подключить позже, когда каркас стабилен.
 */
void SupervisorTask_Run(void const *argument)
{
    (void)argument;

    for (;;)
    {
        /* Одноплатная сборка: отдельных задач CAN/RS-485 в RTOS нет. */
        uint8_t ok =
            AppHealth_IsAlive(TASK_DOOR) &&
            AppHealth_IsAlive(TASK_LOGIC_CORE) &&
            AppHealth_IsAlive(TASK_NET) &&
            AppHealth_IsAlive(TASK_HTTP) &&
            AppHealth_IsAlive(TASK_LOGGER) &&
            AppHealth_IsAlive(TASK_WATCHDOG);

        if (!ok)
        {
            /* SAFE STATE: ничего не должно быть заперто.
             * LED на дверях НЕ трогаем: иначе Supervisor каждые 200 ms ставит зелёный на дверях 1–2,
             * а DoorsTask чаще выставляет красный по логике NC/замка — на выходе «слабое» моргание зелёного.
             * Индикацию ведёт только DoorsTask; при fault приоритет — разомкнуть замок и выключить buzzer. */
            BSP_DoorIO_SetLocked(1, false);
            BSP_DoorIO_SetLocked(2, false);
            BSP_DoorIO_SetBuzzer(1, false);
            BSP_DoorIO_SetBuzzer(2, false);
        }

        AppHealth_Heartbeat(TASK_SUPERVISOR);
        osDelay(200);
    }
}
