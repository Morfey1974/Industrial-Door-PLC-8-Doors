#include "door_hal.h"
#include "bsp_doors_io.h"

/*
 * ВАЖНО:
 * DoorHAL — единственное место, где используется BSP_DoorIO_*
 * Вся логика выше НЕ должна дергать BSP напрямую
 */

void DoorHAL_Init(void)
{
    BSP_DoorsIO_Init();

    /* При старте: всё разблокировано, зелёный, без зуммера */
    DoorHAL_ApplySafeState(1);
    DoorHAL_ApplySafeState(2);
}

/* -------- Входы -------- */

bool DoorHAL_IsClosed(uint8_t door1based)
{
    return BSP_DoorIO_ReadClosed(door1based);
}

bool DoorHAL_IsAlarmPressed(uint8_t door1based)
{
    return BSP_DoorIO_ReadAlarmPressed(door1based);
}

/* -------- Выходы -------- */

void DoorHAL_SetLock(uint8_t door1based, bool lock)
{
    /*
     * Инвариант безопасности:
     * нельзя запирать дверь, если она физически открыта
     */
    if (lock && !DoorHAL_IsClosed(door1based))
    {
        lock = false;
    }

    BSP_DoorIO_SetLocked(door1based, lock);
}

void DoorHAL_SetLed(uint8_t door1based, door_led_t led)
{
    BSP_DoorIO_SetLedMode(
        door1based,
        (led == DOOR_LED_RED) ? BSP_DOOR_LED_RED : BSP_DOOR_LED_GREEN
    );
}

void DoorHAL_SetBuzzer(uint8_t door1based, bool on)
{
    BSP_DoorIO_SetBuzzer(door1based, on);
}

/* -------- Safe State -------- */

void DoorHAL_ApplySafeState(uint8_t door1based)
{
    BSP_DoorIO_SetLocked(door1based, false);
    BSP_DoorIO_SetBuzzer(door1based, false);
    BSP_DoorIO_SetLedMode(door1based, BSP_DOOR_LED_GREEN);
}
