#include "net_task.h"

#include "cmsis_os.h"
#include "lwip.h"
#include "lwip_bringup.h"
#include "app_health.h"

void NetTask_Run(void const *argument)
{
    (void)argument;

    /* LwIP init должен быть в NetTask (чтобы сеть не мешала остальным) */
    MX_LWIP_Init();

    /* bring-up: UDP alive + link/netif/ip monitor (без создания задач!) */
    LwIP_BringUp_Init();

    for (;;)
    {
        AppHealth_Heartbeat(TASK_NET);

        LwIP_BringUp_Poll();

        osDelay(50);
    }
}
