#include "app_log.h"

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
