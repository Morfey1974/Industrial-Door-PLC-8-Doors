#include "net_task.h"

#include "cmsis_os.h"
#include "lwip.h"
#include "lwip_bringup.h"
#include "app_health.h"

void NetTask_Run(void const *argument)
{
    (void)argument;


    /* bring-up: UDP alive + link/netif/ip monitor (без создания задач!) */
    LwIP_BringUp_Init();

    for (;;)
    {
        AppHealth_Heartbeat(TASK_NET);

        LwIP_BringUp_Poll();

        osDelay(50);
    }
}
