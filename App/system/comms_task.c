#include "comms_task.h"

#include "cmsis_os.h"
#include "app_health.h"

#include "can_bringup.h"
#include "rs485_bringup.h"

void CommsTask_Run(void const *argument)
{
    (void)argument;

    /* Встраиваем проверенные протоколы в runtime */
    CAN_Link_Init();
    CAN_Link_Start();

    RS485_Init();

    for (;;)
    {
        AppHealth_Heartbeat(TASK_COMMS);

        /* На ЭТАПЕ 6 тут появится обработка heartbeat/slave/master по CAN */
        /* На ЭТАПЕ 8 тут появится Modbus RTU */

        osDelay(100);
    }
}
