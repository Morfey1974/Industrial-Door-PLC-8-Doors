#pragma once

#include <stdint.h>

/*
 * Health/Heartbeat на FreeRTOS ticks.
 * Supervisor следит, что задачи "живые".
 */

typedef enum
{
    TASK_DOOR = 0,
    TASK_COMMS,
    TASK_NET,
    TASK_SUPERVISOR,
    TASK_COUNT
} task_id_t;

void AppHealth_Init(void);
void AppHealth_Heartbeat(task_id_t id);
uint8_t AppHealth_IsAlive(task_id_t id);
