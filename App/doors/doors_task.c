#include "doors_task.h"

#include <string.h>
#include <stdbool.h>

#include "cmsis_os.h"
#include "main.h"
#include "bsp_doors_io.h"

/* Здесь пока “скелет” для проверки IO.
 * Реальную логику зависимостей подключим позже.
 */

static AppDoorState_t s_doors[APP_DOOR_MAX];

static uint32_t GetMs(void)
{
    return HAL_GetTick();
}

AppDoorState_t* Doors_GetStateArray(void)
{
    return s_doors;
}

void Doors_TaskInit(void)
{
    memset(s_doors, 0, sizeof(s_doors));
    BSP_DoorsIO_Init();
}

static void updateOneDoor(uint8_t door1based)
{
    uint8_t idx = (uint8_t)(door1based - 1U);

    bool closed = BSP_DoorIO_ReadClosed(door1based);
    bool alarm  = BSP_DoorIO_ReadAlarmPressed(door1based);

    if ((s_doors[idx].physClosed != (uint8_t)closed) ||
        (s_doors[idx].alarmPressed != (uint8_t)alarm))
    {
        s_doors[idx].physClosed   = (uint8_t)closed;
        s_doors[idx].alarmPressed = (uint8_t)alarm;
        s_doors[idx].lastChangeMs = GetMs();
    }

    /* Минимальная демонстрационная логика (только IO-проверка):
     * - если дверь закрыта -> заблокировать (красный)
     * - если открыта -> разблокировать (зелёный)
     *
     * Инвариант: “нельзя блокировать открытую дверь”
     */
    bool requestLock = closed;
    if (!closed) requestLock = false;

    BSP_DoorIO_ApplyLockIndicator(door1based, requestLock);
    s_doors[idx].locked = (uint8_t)requestLock;
}

void DoorsTask_Run(void const *argument)
{
    (void)argument;

    Doors_TaskInit();

    for (;;)
    {
        for (uint8_t d = 1; d <= APP_DOOR_MAX; d++)
        {
            updateOneDoor(d);
        }

        osDelay(20);
    }
}
