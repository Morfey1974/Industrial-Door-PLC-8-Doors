#include "app_events.h"

#include "log/event_journal.h"

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
    BaseType_t ok = xQueueSendToBack(s_evtQ, evt, ticks_to_wait);

    /* 2) ЭТАП 7: попытка залогировать (не блокирует) */
    (void)EventJournal_EnqueueEvent(evt);

    return ok;
}

BaseType_t AppEvents_Wait(app_event_t *evt, TickType_t ticks_to_wait)
{
    if (!s_evtQ || !evt) return pdFALSE;
    return xQueueReceive(s_evtQ, evt, ticks_to_wait);
}
