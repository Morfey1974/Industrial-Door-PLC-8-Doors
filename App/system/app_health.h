#pragma once

#include <stdint.h>

/*
 * Health/Heartbeat мониторинг задач (Этап 2.4)
 *
 * Идея:
 * - каждая задача периодически вызывает AppHealth_Heartbeat(TASK_x)
 * - Supervisor/Watchdog проверяет AppHealth_IsAlive(TASK_x)
 */

typedef enum
{
    TASK_DOOR = 0,
    TASK_LOGIC_CORE,
    TASK_CAN,
    TASK_RS485,
    TASK_NET,
    TASK_HTTP,
    TASK_LOGGER,
    TASK_JOURNAL,
    TASK_SUPERVISOR,
    TASK_WATCHDOG,

    TASK_COUNT
} task_id_t;

void    AppHealth_Init(void);
void    AppHealth_Heartbeat(task_id_t id);
uint8_t AppHealth_IsAlive(task_id_t id);
