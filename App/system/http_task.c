#include "http_task.h"

#include "cmsis_os.h"
#include "app_health.h"

/*
 * В проекте предполагается WEB-конфигуратор.
 *
 * Здесь только RTOS-каркас: задача будет обслуживать HTTP/REST и
 * публиковать/принимать события (AppEvents) для настройки.
 */

void HttpTask_Run(void const *argument)
{
    (void)argument;

    for (;;)
    {
        AppHealth_Heartbeat(TASK_HTTP);

        /* TODO: httpd / rest endpoint poll */
        osDelay(50);
    }
}
