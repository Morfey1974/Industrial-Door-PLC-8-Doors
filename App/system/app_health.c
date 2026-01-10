#include "app_health.h"
#include "FreeRTOS.h"
#include "task.h"

#define HEARTBEAT_TIMEOUT_MS 2000

static TickType_t lastHb[TASK_COUNT];

void AppHealth_Init(void)
{
    TickType_t now = xTaskGetTickCount();

    /* На старте считаем, что все живы "сейчас", чтобы Supervisor не ушёл в safe-state раньше запуска задач */
    for (uint32_t i = 0; i < TASK_COUNT; i++)
        lastHb[i] = now;
}

void AppHealth_Heartbeat(task_id_t id)
{
    if ((uint32_t)id >= (uint32_t)TASK_COUNT) return;
    lastHb[id] = xTaskGetTickCount();
}

uint8_t AppHealth_IsAlive(task_id_t id)
{
    if ((uint32_t)id >= (uint32_t)TASK_COUNT) return 0;

    TickType_t now = xTaskGetTickCount();
    TickType_t dt  = now - lastHb[id];

    return (dt < pdMS_TO_TICKS(HEARTBEAT_TIMEOUT_MS)) ? 1U : 0U;
}
