#pragma once

#include <stdint.h>
#include <stdbool.h>

/*
 * Door HAL — аппаратная модель двери
 * Не содержит логики состояний, только безопасный доступ к железу
 */

typedef enum
{
    DOOR_LED_GREEN = 0,
    DOOR_LED_RED
} door_led_t;

/* Инициализация HAL (один раз при старте) */
void DoorHAL_Init(void);

/* Входы */
bool DoorHAL_IsClosed(uint8_t door1based);
bool DoorHAL_IsAlarmPressed(uint8_t door1based);

/* Выходы */
void DoorHAL_SetLock(uint8_t door1based, bool lock);
void DoorHAL_SetLed(uint8_t door1based, door_led_t led);
void DoorHAL_SetBuzzer(uint8_t door1based, bool on);

/* Безопасное состояние (используется Supervisor’ом и на старте) */
void DoorHAL_ApplySafeState(uint8_t door1based);
