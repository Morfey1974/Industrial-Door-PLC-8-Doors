#pragma once

#include <stdint.h>

#ifndef APP_DOOR_MAX
#define APP_DOOR_MAX 8
#endif

typedef struct
{
    uint8_t physClosed;      // 1 = закрыта по датчику
    uint8_t alarmPressed;    // 1 = Alarm нажата (сырое чтение)
    uint8_t locked;          // 1 = замок активирован (фактически выставлено)
    uint8_t alarming;        // 1 = режим сигнализации (мигание+зуммер)
    uint32_t lastChangeMs;
} AppDoorState_t;

void Doors_TaskInit(void);

/**
 * Реальная “тело-задачи” дверей.
 * Важно: НЕ называем StartDoorsTask, чтобы не конфликтовать с CubeMX freertos.c
 */
void DoorsTask_Run(void const *argument);

/* Для других модулей (Logic Core позже) */
AppDoorState_t* Doors_GetStateArray(void);
