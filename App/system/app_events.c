#include "app_events.h"

#include "log/event_journal.h"

#define EVENT_QUEUE_LEN 32

static QueueHandle_t s_evtQ = NULL;
static UBaseType_t s_evt_q_peak_waiting = 0U;

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

void AppEvents_GetQueueMetrics(uint32_t *out_waiting, uint32_t *out_capacity,
                               uint32_t *out_peak_waiting)
{
    if (out_waiting) *out_waiting = 0U;
    if (out_capacity) *out_capacity = 0U;
    if (out_peak_waiting) *out_peak_waiting = 0U;
    if (!s_evtQ) return;

    UBaseType_t w = uxQueueMessagesWaiting(s_evtQ);
    UBaseType_t sp = uxQueueSpacesAvailable(s_evtQ);
    if (w > s_evt_q_peak_waiting)
        s_evt_q_peak_waiting = w;

    if (out_waiting) *out_waiting = (uint32_t)w;
    if (out_capacity) *out_capacity = (uint32_t)(w + sp);
    if (out_peak_waiting) *out_peak_waiting = (uint32_t)s_evt_q_peak_waiting;
}
