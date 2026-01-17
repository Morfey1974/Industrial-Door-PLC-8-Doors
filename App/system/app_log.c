#include "app_log.h"

#include <stdio.h>
#include <string.h>

#define LOG_QUEUE_LEN 32

static QueueHandle_t s_logQ = NULL;

void AppLog_Init(void)
{
    if (s_logQ != NULL) return;
    s_logQ = xQueueCreate(LOG_QUEUE_LEN, sizeof(app_log_msg_t));
}

BaseType_t AppLog_Push(const app_log_msg_t *msg, TickType_t ticks_to_wait)
{
    if (!s_logQ || !msg) return pdFALSE;
    return xQueueSendToBack(s_logQ, msg, ticks_to_wait);
}

BaseType_t AppLog_Pop(app_log_msg_t *msg, TickType_t ticks_to_wait)
{
    if (!s_logQ || !msg) return pdFALSE;
    return xQueueReceive(s_logQ, msg, ticks_to_wait);
}

/* --------------------------------------------------------------------------
 * Высокоуровневый printf-подобный интерфейс
 *
 * Важно:
 *  - Журнал/логика не должны зависеть от наличия LoggerTask.
 *  - Поэтому AppLog() просто складывает строку в очередь и НЕ блокируется.
 *  - Если очередь не создана/переполнена — сообщение тихо теряется.
 * -------------------------------------------------------------------------- */

void AppLogV(const char *fmt, va_list ap)
{
    if (fmt == NULL)
        return;

    if (s_logQ == NULL)
    {
        /* Очередь не инициализирована — на раннем старте лог пропускаем. */
        return;
    }

    app_log_msg_t msg;
    msg.timestamp = (uint32_t)xTaskGetTickCount();
    (void)vsnprintf(msg.text, sizeof(msg.text), fmt, ap);

    /* Неблокирующая отправка (0 тиков ожидания) */
    (void)AppLog_Push(&msg, 0);
}

void AppLog(const char *fmt, ...)
{
    if (fmt == NULL)
        return;

    va_list ap;
    va_start(ap, fmt);
    AppLogV(fmt, ap);
    va_end(ap);
}
