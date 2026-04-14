#include "app_events.h"

#define EVENT_QUEUE_LEN 32

static QueueHandle_t s_evtQ = NULL;

void AppEvents_Init(void)
{
    if (s_evtQ != NULL) return;
    s_evtQ = xQueueCreate(EVENT_QUEUE_LEN, sizeof(app_event_t));
}

BaseType_t AppEvents_Publish(const app_event_t *evt, TickType_t ticks_to_wait)
{
    if (!s_evtQ || !evt) return pdFALSE;

    /* 1) Основная шина событий */
    return xQueueSendToBack(s_evtQ, evt, ticks_to_wait);
}

BaseType_t AppEvents_Wait(app_event_t *evt, TickType_t ticks_to_wait)
{
    if (!s_evtQ || !evt) return pdFALSE;
    return xQueueReceive(s_evtQ, evt, ticks_to_wait);
}
