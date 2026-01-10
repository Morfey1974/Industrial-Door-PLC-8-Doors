#include "supervisor_task.h"

#include "cmsis_os.h"
#include "app_health.h"
#include "bsp_doors_io.h"

/*
 * SupervisorTask:
 * - следит за heartbeat задач
 * - при проблеме — safe-state (unlock + buzzer off + green)
 *
 * Примечание:
 * аппаратный IWDG можно подключить позже, когда каркас стабилен.
 */
void SupervisorTask_Run(void const *argument)
{
    (void)argument;

    for (;;)
    {
        uint8_t ok =
            AppHealth_IsAlive(TASK_DOOR) &&
            AppHealth_IsAlive(TASK_COMMS) &&
            AppHealth_IsAlive(TASK_NET);

        if (!ok)
        {
            /* SAFE STATE: ничего не должно быть заперто */
            BSP_DoorIO_SetLocked(1, false);
            BSP_DoorIO_SetLocked(2, false);
            BSP_DoorIO_SetBuzzer(1, false);
            BSP_DoorIO_SetBuzzer(2, false);
            BSP_DoorIO_SetLedMode(1, BSP_DOOR_LED_GREEN);
            BSP_DoorIO_SetLedMode(2, BSP_DOOR_LED_GREEN);
        }

        AppHealth_Heartbeat(TASK_SUPERVISOR);
        osDelay(200);
    }
}
