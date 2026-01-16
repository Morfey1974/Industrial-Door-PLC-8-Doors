#include "rs485_task.h"

#include "cmsis_os.h"
#include "app_health.h"

#include "rs485_bringup.h"

void Rs485Task_Run(void const *argument)
{
    (void)argument;

    RS485_Init();

    for (;;)
    {
        AppHealth_Heartbeat(TASK_RS485);

        /* Этап 8: Modbus RTU и др. */
        osDelay(100);
    }
}
