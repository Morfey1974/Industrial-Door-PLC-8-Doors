#include "logger_task.h"

#include <string.h>

#include "cmsis_os.h"
#include "app_health.h"
#include "app_log.h"

__attribute__((weak)) void AppLog_Output(const char *line)
{
    /* Переопределите в проекте, если нужен другой вывод (UART, ITM, UDP). */
    (void)line;
}

void LoggerTask_Run(void const *argument)
{
    (void)argument;

    app_log_msg_t msg;

    for (;;)
    {
        AppHealth_Heartbeat(TASK_LOGGER);

        if (AppLog_Pop(&msg, pdMS_TO_TICKS(200)) == pdTRUE)
        {
            msg.text[APP_LOG_MSG_MAX - 1] = '\0';
            AppLog_Output(msg.text);
        }
    }
}
