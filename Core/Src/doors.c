#include "doors.h"
#include "main.h"
#include "cmsis_os.h"
#include <string.h>
#include "door_logic.h"
#include "system_config.h"

DoorState_t Door[DOOR_COUNT];
DoorConfig_t DoorCfg[DOOR_COUNT];

uint32_t GetMs(void)
{
    return HAL_GetTick();   // позже будем использовать RTOS тики при необходимости
}

static void UpdateDoorState(uint8_t id)
{
    uint8_t phys = 0;
    uint8_t alarm = 0;

    switch(id)
    {
    case 0:
        phys  = (KeySensorDoor1 == GPIO_PIN_RESET); // зависит от схемы
        alarm = (KeyAlarmDoor1 == GPIO_PIN_RESET);
        break;
    case 1:
        phys  = (KeySensorDoor2 == GPIO_PIN_RESET);
        alarm = (KeyAlarmDoor2 == GPIO_PIN_RESET);
        break;
    case 2:
        phys  = (KeySensorDoor3 == GPIO_PIN_RESET);
        alarm = (KeyAlarmDoor3 == GPIO_PIN_RESET);
        break;
    case 3:
        phys  = (KeySensorDoor4 == GPIO_PIN_RESET);
        alarm = (KeyAlarmDoor4 == GPIO_PIN_RESET);
        break;
    case 4:
        phys  = (KeySensorDoor5 == GPIO_PIN_RESET);
        alarm = (KeyAlarmDoor5 == GPIO_PIN_RESET);
        break;
    case 5:
        phys  = (KeySensorDoor6 == GPIO_PIN_RESET);
        alarm = (KeyAlarmDoor6 == GPIO_PIN_RESET);
        break;
    case 6:
        phys  = (KeySensorDoor7 == GPIO_PIN_RESET);
        alarm = (KeyAlarmDoor7 == GPIO_PIN_RESET);
        break;
    case 7:
        phys  = (KeySensorDoor8 == GPIO_PIN_RESET);
        alarm = (KeyAlarmDoor8 == GPIO_PIN_RESET);
        break;
    }

    if (Door[id].physClosed != phys ||
        Door[id].alarmPressed != alarm)
    {
        Door[id].physClosed   = phys;
        Door[id].alarmPressed = alarm;
        Door[id].lastChangeMs = GetMs();
    }
}

void StartDoorsTask(void *argument)
{
    memset(Door, 0, sizeof(Door));
    memset(DoorCfg, 0, sizeof(DoorCfg));

    DoorLogic_Init();

    for(;;)
    {
        uint8_t count = g_sysCfg.localDoorCount;
        if (count > DOOR_COUNT) count = DOOR_COUNT; // защита

        // 1. Обновляем состояния всех локальных дверей
        for (uint8_t i = 0; i < count; i++)
        {
            UpdateDoorState(i);
        }

        // 2. Применяем логику №1 только к тем дверям, которые реально есть
        DoorLogic_Apply();

        osDelay(20);
    }
}
#include "doors.h"

void Doors_Init(void)
{
    // Сначала всё в безопасное состояние
    Door1_Open();
    // При желании можно сразу погасить остальные двери или тоже закрыть
    // Door2_Close(); и т.д.
}


