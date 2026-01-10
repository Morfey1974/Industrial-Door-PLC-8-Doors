#include "doors_task.h"

#include <string.h>
#include <stdbool.h>

#include "cmsis_os.h"
#include "main.h"
#include "bsp_doors_io.h"

/* ============================================================
   Doors Task (после bring-up)
   ------------------------------------------------------------
   Сохраняем:
     - дефолт: все двери UNLOCKED, LED GREEN, buzzer OFF
     - Alarm toggle -> режим сигнализации для конкретной двери
     - Сигнализация: чередование R/G по 1 секунде + buzzer в RED фазе
     - Инвариант: LOCK запрещён при открытой двери (physClosed == 0)

   Убираем bring-up шум:
     - heartbeat LED на Door1
     - printf/Debug_Print heartbeat
   ============================================================ */

static AppDoorState_t s_doors[APP_DOOR_MAX];

/* Локальные сервисные состояния (не выносим в AppDoorState_t) */
static uint8_t  s_prevAlarmRaw[APP_DOOR_MAX];
static uint32_t s_lastAlarmEdgeMs[APP_DOOR_MAX];
static uint32_t s_lastBlinkMs[APP_DOOR_MAX];
static uint8_t  s_blinkPhase[APP_DOOR_MAX]; /* 0=GREEN, 1=RED */

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
    memset(s_prevAlarmRaw, 0, sizeof(s_prevAlarmRaw));
    memset(s_lastAlarmEdgeMs, 0, sizeof(s_lastAlarmEdgeMs));
    memset(s_lastBlinkMs, 0, sizeof(s_lastBlinkMs));
    memset(s_blinkPhase, 0, sizeof(s_blinkPhase));

    /* Безопасный дефолт железа:
       lock OFF, green ON, red OFF, buzzer OFF */
    BSP_DoorsIO_Init();
}

/* Нормальный режим двери (вне сигнализации):
   - всегда unlocked
   - зелёный постоянно
   - buzzer OFF */
static void applyNormal(uint8_t door1based)
{
    BSP_DoorIO_SetLocked(door1based, false);
    BSP_DoorIO_SetLedMode(door1based, BSP_DOOR_LED_GREEN);
    BSP_DoorIO_SetBuzzer(door1based, false);
}

/* Режим сигнализации для одной двери:
   - чередование R/G по 1 секунде
   - buzzer включён в RED фазе
   - LOCK пытаемся включать только в RED фазе и только если дверь закрыта (инвариант) */
static void applySignaling(uint8_t door1based, bool physClosed, uint8_t idx)
{
    uint32_t now = GetMs();

    /* Чередование R/G по 1 секунде */
    if ((now - s_lastBlinkMs[idx]) >= 1000U)
    {
        s_lastBlinkMs[idx] = now;
        s_blinkPhase[idx] ^= 1U;
    }

    bool redPhase = (s_blinkPhase[idx] != 0U);

    BSP_DoorIO_SetLedMode(door1based, redPhase ? BSP_DOOR_LED_RED : BSP_DOOR_LED_GREEN);
    BSP_DoorIO_SetBuzzer(door1based, redPhase);

    /* LOCK: только в RED фазе, но строго по инварианту */
    bool wantLock = redPhase;

    if (!physClosed)
    {
        wantLock = false;
    }

    BSP_DoorIO_SetLocked(door1based, wantLock);
    s_doors[idx].locked = (uint8_t)wantLock;
}

static void updateOneDoor(uint8_t door1based)
{
    uint8_t idx = (uint8_t)(door1based - 1U);
    uint32_t now = GetMs();

    bool closed = BSP_DoorIO_ReadClosed(door1based);
    bool alarm  = BSP_DoorIO_ReadAlarmPressed(door1based);

    /* Обновляем “сырое” состояние */
    if ((s_doors[idx].physClosed != (uint8_t)closed) ||
        (s_doors[idx].alarmPressed != (uint8_t)alarm))
    {
        s_doors[idx].physClosed   = (uint8_t)closed;
        s_doors[idx].alarmPressed = (uint8_t)alarm;
        s_doors[idx].lastChangeMs = now;
    }

    /* Toggle по нажатию Alarm (по фронту), антидребезг ~50мс */
    if (alarm && !s_prevAlarmRaw[idx])
    {
        if ((now - s_lastAlarmEdgeMs[idx]) >= 50U)
        {
            s_lastAlarmEdgeMs[idx] = now;
            s_doors[idx].alarming ^= 1U;

            if (s_doors[idx].alarming)
            {
                /* При входе в сигнализацию начинаем с GREEN фазы */
                s_blinkPhase[idx] = 0U;
                s_lastBlinkMs[idx] = now;
            }
            else
            {
                /* При выходе — вернуть всё в безопасный дефолт */
                s_doors[idx].locked = 0U;
                BSP_DoorIO_SetLocked(door1based, false);
                BSP_DoorIO_SetBuzzer(door1based, false);
                BSP_DoorIO_SetLedMode(door1based, BSP_DOOR_LED_GREEN);
            }
        }
    }
    s_prevAlarmRaw[idx] = (uint8_t)alarm;

    /* Основная логика */
    if (s_doors[idx].alarming)
    {
        applySignaling(door1based, closed, idx);
    }
    else
    {
        applyNormal(door1based);
        s_doors[idx].locked = 0U;
    }

    /* Жёсткое соблюдение инварианта:
       если дверь открыта — LOCK всегда 0 (независимо от всего) */
    if (!closed)
    {
        BSP_DoorIO_SetLocked(door1based, false);
        s_doors[idx].locked = 0U;
    }
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
