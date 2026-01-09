#include "bsp_doors_io.h"

/*
 * По твоему doors.h:
 * - LookDoorX_ON  -> GPIO_PIN_RESET (active-low)
 * - LEDx_ON       -> GPIO_PIN_RESET (active-low)
 * - Buzzer_ON     -> GPIO_PIN_RESET (active-low)
 * - KeySensorDoor -> читается и сравнивается с RESET (active-low)
 * - KeyAlarmDoor  -> читается и сравнивается с RESET (active-low)
 */
#define BSP_ACTIVE_LOW_WRITE(port, pin, on) \
    HAL_GPIO_WritePin((port), (pin), (on) ? GPIO_PIN_RESET : GPIO_PIN_SET)

#define BSP_ACTIVE_LOW_READ_IS_ON(port, pin) \
    (HAL_GPIO_ReadPin((port), (pin)) == GPIO_PIN_RESET)

/* Таблицы соответствий “дверь (1..8) → порт/пин” */
static GPIO_TypeDef* const s_lockPort[BSP_DOOR_MAX] = {
    CPULookDoor1_GPIO_Port, CPULookDoor2_GPIO_Port, CPULookDoor3_GPIO_Port, CPULookDoor4_GPIO_Port,
    CPULookDoor5_GPIO_Port, CPULookDoor6_GPIO_Port, CPULookDoor7_GPIO_Port, CPULookDoor8_GPIO_Port
};
static const uint16_t s_lockPin[BSP_DOOR_MAX] = {
    CPULookDoor1_Pin, CPULookDoor2_Pin, CPULookDoor3_Pin, CPULookDoor4_Pin,
    CPULookDoor5_Pin, CPULookDoor6_Pin, CPULookDoor7_Pin, CPULookDoor8_Pin
};

static GPIO_TypeDef* const s_ledGPort[BSP_DOOR_MAX] = {
    CPULedGreenDoor1_GPIO_Port, CPULedGreenDoor2_GPIO_Port, CPULedGreenDoor3_GPIO_Port, CPULedGreenDoor4_GPIO_Port,
    CPULedGreenDoor5_GPIO_Port, CPULedGreenDoor6_GPIO_Port, CPULedGreenDoor7_GPIO_Port, CPULedGreenDoor8_GPIO_Port
};
static const uint16_t s_ledGPin[BSP_DOOR_MAX] = {
    CPULedGreenDoor1_Pin, CPULedGreenDoor2_Pin, CPULedGreenDoor3_Pin, CPULedGreenDoor4_Pin,
    CPULedGreenDoor5_Pin, CPULedGreenDoor6_Pin, CPULedGreenDoor7_Pin, CPULedGreenDoor8_Pin
};

static GPIO_TypeDef* const s_ledRPort[BSP_DOOR_MAX] = {
    CPULedRedDoor1_GPIO_Port, CPULedRedDoor2_GPIO_Port, CPULedRedDoor3_GPIO_Port, CPULedRedDoor4_GPIO_Port,
    CPULedRedDoor5_GPIO_Port, CPULedRedDoor6_GPIO_Port, CPULedRedDoor7_GPIO_Port, CPULedRedDoor8_GPIO_Port
};
static const uint16_t s_ledRPin[BSP_DOOR_MAX] = {
    CPULedRedDoor1_Pin, CPULedRedDoor2_Pin, CPULedRedDoor3_Pin, CPULedRedDoor4_Pin,
    CPULedRedDoor5_Pin, CPULedRedDoor6_Pin, CPULedRedDoor7_Pin, CPULedRedDoor8_Pin
};

static GPIO_TypeDef* const s_buzPort[BSP_DOOR_MAX] = {
    CPUBuzzerDoor1_GPIO_Port, CPUBuzzerDoor2_GPIO_Port, CPUBuzzerDoor3_GPIO_Port, CPUBuzzerDoor4_GPIO_Port,
    CPUBuzzerDoor5_GPIO_Port, CPUBuzzerDoor6_GPIO_Port, CPUBuzzerDoor7_GPIO_Port, CPUBuzzerDoor8_GPIO_Port
};
static const uint16_t s_buzPin[BSP_DOOR_MAX] = {
    CPUBuzzerDoor1_Pin, CPUBuzzerDoor2_Pin, CPUBuzzerDoor3_Pin, CPUBuzzerDoor4_Pin,
    CPUBuzzerDoor5_Pin, CPUBuzzerDoor6_Pin, CPUBuzzerDoor7_Pin, CPUBuzzerDoor8_Pin
};

static GPIO_TypeDef* const s_sensorPort[BSP_DOOR_MAX] = {
    CPUKeySensorDoor1_GPIO_Port, CPUKeySensorDoor2_GPIO_Port, CPUKeySensorDoor3_GPIO_Port, CPUKeySensorDoor4_GPIO_Port,
    CPUKeySensorDoor5_GPIO_Port, CPUKeySensorDoor6_GPIO_Port, CPUKeySensorDoor7_GPIO_Port, CPUKeySensorDoor8_GPIO_Port
};
static const uint16_t s_sensorPin[BSP_DOOR_MAX] = {
    CPUKeySensorDoor1_Pin, CPUKeySensorDoor2_Pin, CPUKeySensorDoor3_Pin, CPUKeySensorDoor4_Pin,
    CPUKeySensorDoor5_Pin, CPUKeySensorDoor6_Pin, CPUKeySensorDoor7_Pin, CPUKeySensorDoor8_Pin
};

static GPIO_TypeDef* const s_alarmPort[BSP_DOOR_MAX] = {
    CPUKeyAlarmDoor1_GPIO_Port, CPUKeyAlarmDoor2_GPIO_Port, CPUKeyAlarmDoor3_GPIO_Port, CPUKeyAlarmDoor4_GPIO_Port,
    CPUKeyAlarmDoor5_GPIO_Port, CPUKeyAlarmDoor6_GPIO_Port, CPUKeyAlarmDoor7_GPIO_Port, CPUKeyAlarmDoor8_GPIO_Port
};
static const uint16_t s_alarmPin[BSP_DOOR_MAX] = {
    CPUKeyAlarmDoor1_Pin, CPUKeyAlarmDoor2_Pin, CPUKeyAlarmDoor3_Pin, CPUKeyAlarmDoor4_Pin,
    CPUKeyAlarmDoor5_Pin, CPUKeyAlarmDoor6_Pin, CPUKeyAlarmDoor7_Pin, CPUKeyAlarmDoor8_Pin
};

static inline bool doorIndexOk(uint8_t door1based)
{
    return (door1based >= 1U) && (door1based <= BSP_DOOR_MAX);
}

void BSP_DoorsIO_Init(void)
{
    /* Безопасно: замок OFF, зелёный ON, красный OFF, buzzer OFF */
    for (uint8_t d = 1; d <= BSP_DOOR_MAX; d++)
    {
        BSP_DoorIO_SetLocked(d, false);
        BSP_DoorIO_SetLedMode(d, BSP_DOOR_LED_GREEN);
        BSP_DoorIO_SetBuzzer(d, false);
    }
}

bool BSP_DoorIO_ReadClosed(uint8_t localDoor_1based)
{
    if (!doorIndexOk(localDoor_1based)) return false;
    uint8_t i = (uint8_t)(localDoor_1based - 1U);

    /* active-low: RESET = “сработал” */
    bool sensorOn = BSP_ACTIVE_LOW_READ_IS_ON(s_sensorPort[i], s_sensorPin[i]);

    /* В твоём старом коде physClosed = (KeySensor == RESET) */
    return sensorOn;
}

bool BSP_DoorIO_ReadAlarmPressed(uint8_t localDoor_1based)
{
    if (!doorIndexOk(localDoor_1based)) return false;
    uint8_t i = (uint8_t)(localDoor_1based - 1U);

    bool alarmOn = BSP_ACTIVE_LOW_READ_IS_ON(s_alarmPort[i], s_alarmPin[i]);
    return alarmOn;
}

void BSP_DoorIO_SetLocked(uint8_t localDoor_1based, bool locked)
{
    if (!doorIndexOk(localDoor_1based)) return;
    uint8_t i = (uint8_t)(localDoor_1based - 1U);

    BSP_ACTIVE_LOW_WRITE(s_lockPort[i], s_lockPin[i], locked);
}

void BSP_DoorIO_SetLedMode(uint8_t localDoor_1based, bsp_door_led_mode_t mode)
{
    if (!doorIndexOk(localDoor_1based)) return;
    uint8_t i = (uint8_t)(localDoor_1based - 1U);

    switch (mode)
    {
        case BSP_DOOR_LED_OFF:
            BSP_ACTIVE_LOW_WRITE(s_ledRPort[i], s_ledRPin[i], false);
            BSP_ACTIVE_LOW_WRITE(s_ledGPort[i], s_ledGPin[i], false);
            break;

        case BSP_DOOR_LED_GREEN:
            BSP_ACTIVE_LOW_WRITE(s_ledRPort[i], s_ledRPin[i], false);
            BSP_ACTIVE_LOW_WRITE(s_ledGPort[i], s_ledGPin[i], true);
            break;

        case BSP_DOOR_LED_RED:
            BSP_ACTIVE_LOW_WRITE(s_ledGPort[i], s_ledGPin[i], false);
            BSP_ACTIVE_LOW_WRITE(s_ledRPort[i], s_ledRPin[i], true);
            break;

        case BSP_DOOR_LED_ALTERNATE_RG:
            /* сам режим мигания реализуется в App (таймером),
               тут просто оставим состояние как OFF и будем дёргать App-ом */
            BSP_ACTIVE_LOW_WRITE(s_ledRPort[i], s_ledRPin[i], false);
            BSP_ACTIVE_LOW_WRITE(s_ledGPort[i], s_ledGPin[i], false);
            break;

        default:
            break;
    }
}

void BSP_DoorIO_SetBuzzer(uint8_t localDoor_1based, bool on)
{
    if (!doorIndexOk(localDoor_1based)) return;
    uint8_t i = (uint8_t)(localDoor_1based - 1U);

    BSP_ACTIVE_LOW_WRITE(s_buzPort[i], s_buzPin[i], on);
}

void BSP_DoorIO_ApplyLockIndicator(uint8_t localDoor_1based, bool locked)
{
    BSP_DoorIO_SetLocked(localDoor_1based, locked);
    BSP_DoorIO_SetLedMode(localDoor_1based, locked ? BSP_DOOR_LED_RED : BSP_DOOR_LED_GREEN);
}
