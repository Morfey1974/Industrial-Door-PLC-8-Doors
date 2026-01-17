#include "logger_task.h"

#include <string.h>

#include "cmsis_os.h"
#include "app_health.h"
#include "app_log.h"
#include "app_log_uart3.h"

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

        /* UART3 CLI (вариант B, без FreeRTOS Timers)
         * ------------------------------------------
         * В IRQ USART3 мы только принимаем байты и складываем готовые команды
         * в pending-очередь (в app_log_uart3.c).
         *
         * Выполнять команды в IRQ нельзя, поэтому выполняем их здесь — в контексте задачи.
         *
         * Почему здесь (до AppLog_Pop):
         *  - AppLog_Pop может блокироваться до 200 мс
         *  - если не вызвать ProcessPending заранее, CLI будет "тупить"
         */
        AppLog_Uart3_ProcessPending();

        if (AppLog_Pop(&msg, pdMS_TO_TICKS(200)) == pdTRUE)
        {
            msg.text[APP_LOG_MSG_MAX - 1] = '\0';
            AppLog_Output(msg.text);
        }
    }
}
