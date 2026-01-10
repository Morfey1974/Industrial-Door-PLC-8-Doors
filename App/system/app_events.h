#pragma once

#include <stdint.h>
#include "FreeRTOS.h"
#include "queue.h"

typedef enum
{
    EVT_NONE = 0,

    EVT_DOOR_OPEN,
    EVT_DOOR_CLOSE,
    EVT_DOOR_ALARM,

    EVT_CMD_LOCK,
    EVT_CMD_UNLOCK,

    EVT_NET_LINK_UP,
    EVT_NET_LINK_DOWN,

    EVT_SYSTEM_FAULT
} app_event_type_t;

typedef struct
{
    app_event_type_t type;
    uint32_t source;
    uint32_t param;
    uint32_t timestamp; /* xTaskGetTickCount() */
} app_event_t;

void AppEvents_Init(void);
BaseType_t AppEvents_Publish(const app_event_t *evt, TickType_t ticks_to_wait);
BaseType_t AppEvents_Wait(app_event_t *evt, TickType_t ticks_to_wait);
