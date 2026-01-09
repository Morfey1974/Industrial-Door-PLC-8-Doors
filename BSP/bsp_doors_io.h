#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "main.h"

#ifndef BSP_DOOR_MAX
#define BSP_DOOR_MAX 8
#endif

typedef enum
{
    BSP_DOOR_LED_OFF = 0,
    BSP_DOOR_LED_GREEN,
    BSP_DOOR_LED_RED,
    BSP_DOOR_LED_ALTERNATE_RG  // для сигнализации (мигание R/G)
} bsp_door_led_mode_t;

/**
 * Инициализация BSP-слоя дверей (выставить безопасные уровни).
 * Важно: у тебя замок активируется при подаче питания (LookDoor*_ON -> GPIO RESET),
 * поэтому "безопасно" = UNLOCK (LookDoor OFF), зелёный ON, красный OFF, buzzer OFF.
 */
void BSP_DoorsIO_Init(void);

/** Датчик двери: true = дверь закрыта (physClosed=1) */
bool BSP_DoorIO_ReadClosed(uint8_t localDoor_1based);

/** Кнопка Alarm: true = нажата */
bool BSP_DoorIO_ReadAlarmPressed(uint8_t localDoor_1based);

/** Управление замком: locked=true -> активировать соленоид (закрыть/заблокировать) */
void BSP_DoorIO_SetLocked(uint8_t localDoor_1based, bool locked);

/** Управление LED (красный/зелёный) */
void BSP_DoorIO_SetLedMode(uint8_t localDoor_1based, bsp_door_led_mode_t mode);

/** Управление зуммером */
void BSP_DoorIO_SetBuzzer(uint8_t localDoor_1based, bool on);

/**
 * Удобная функция:
 * unlocked -> зелёный, locked -> красный.
 */
void BSP_DoorIO_ApplyLockIndicator(uint8_t localDoor_1based, bool locked);
