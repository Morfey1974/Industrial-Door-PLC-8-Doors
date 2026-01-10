#include "doors_task.h"

#include <string.h>
#include <stdbool.h>

#include "cmsis_os.h"
#include "main.h"
#include "bsp_doors_io.h"

/* Stage-2 system */
#include "app_events.h"
#include "app_health.h"

/* ============================================================
   Doors Task (после bring-up, ЭТАП 2 совместимый)
   ------------------------------------------------------------
   Сохраняем:
     - дефолт: все двери UNLOCKED, LED GREEN, buzzer OFF
     - Alarm toggle -> режим сигнализации для конкретной двери
     - Сигнализация: чередование R/G по 1 секунде + buzzer в RED фазе
     - Инвариант: LOCK запрещён при открытой двери (physClosed == 0)

   Добавлено (ЭТАП 2):
     - Heartbeat для Supervisor
     - Публикация событий в EventBus (DoorOpen/DoorClose/Alarm)
   ============================================================ */

static AppDoorState_t s_doors[APP_DOOR_MAX];

/* Локальные сервисные состояния */
static uint8_t  s_prevAlarmRaw[APP_DOOR_MAX];
static uint32_t s_lastAlarmEdgeMs[APP_DOOR_MAX];
static uint32_t s_lastBlinkMs[APP_DOOR_MAX];
static uint8_t  s_blinkPhase[APP_DOOR_MAX]; /* 0=GREEN, 1=RED */

static uint32_t GetMs(void)
{
    return HAL_GetTick();
}

static void publish_event(app_event_type_t type, uint32_t door1based, uint32_t param)
{
    app_event_t evt;
    evt.type      = type;
    evt.source    = (uint32_t)TASK_DOOR;
    evt.param     = (door1based & 0xFFu) | (param << 8);
    evt.timestamp = (uint32_t)xTaskGetTickCount();
    (void)AppEvents_Publish(&evt, 0);
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

    /* Безопасный дефолт железа */
    BSP_DoorsIO_Init();
}

/* Нормальный режим: unlocked + green + buzzer off */
static void applyNormal(uint8_t door1based)
{
    BSP_DoorIO_SetLocked(door1based, false);
    BSP_DoorIO_SetLedMode(door1based, BSP_DOOR_LED_GREEN);
    BSP_DoorIO_SetBuzzer(door1based, false);
}

/* Сигнализация:
   - мигание R/G по 1с
   - buzzer в RED фазе
   - LOCK только в RED и только если physClosed */
static void applySignaling(uint8_t door1based, bool physClosed, uint8_t idx)
{
    uint32_t now = GetMs();

    if ((now - s_lastBlinkMs[idx]) >= 1000U)
    {
        s_lastBlinkMs[idx] = now;
        s_blinkPhase[idx] ^= 1U;
    }

    bool redPhase = (s_blinkPhase[idx] != 0U);

    BSP_DoorIO_SetLedMode(door1based, redPhase ? BSP_DOOR_LED_RED : BSP_DOOR_LED_GREEN);
    BSP_DoorIO_SetBuzzer(door1based, redPhase);

    bool wantLock = redPhase;

    /* Инвариант безопасности */
    if (!physClosed)
        wantLock = false;

    BSP_DoorIO_SetLocked(door1based, wantLock);
    s_doors[idx].locked = (uint8_t)wantLock;
}

static void updateOneDoor(uint8_t door1based)
{
    uint8_t  idx = (uint8_t)(door1based - 1U);
    uint32_t now = GetMs();

    bool closed = BSP_DoorIO_ReadClosed(door1based);
    bool alarm  = BSP_DoorIO_ReadAlarmPressed(door1based);

    /* Door open/close events */
    if (s_doors[idx].physClosed != (uint8_t)closed)
    {
        s_doors[idx].physClosed   = (uint8_t)closed;
        s_doors[idx].lastChangeMs = now;

        publish_event(closed ? EVT_DOOR_CLOSE : EVT_DOOR_OPEN, door1based, 0);
    }

    /* raw alarm state update */
    if (s_doors[idx].alarmPressed != (uint8_t)alarm)
    {
        s_doors[idx].alarmPressed = (uint8_t)alarm;
        s_doors[idx].lastChangeMs = now;
    }

    /* Toggle alarming by Alarm button edge, debounced ~50ms */
    if (alarm && !s_prevAlarmRaw[idx])
    {
        if ((now - s_lastAlarmEdgeMs[idx]) >= 50U)
        {
            s_lastAlarmEdgeMs[idx] = now;
            s_doors[idx].alarming ^= 1U;

            publish_event(EVT_DOOR_ALARM, door1based, s_doors[idx].alarming ? 1U : 0U);

            if (s_doors[idx].alarming)
            {
                /* start signaling from GREEN */
                s_blinkPhase[idx] = 0U;
                s_lastBlinkMs[idx] = now;
            }
            else
            {
                /* exit signaling -> safe defaults */
                s_doors[idx].locked = 0U;
                BSP_DoorIO_SetLocked(door1based, false);
                BSP_DoorIO_SetBuzzer(door1based, false);
                BSP_DoorIO_SetLedMode(door1based, BSP_DOOR_LED_GREEN);
            }
        }
    }
    s_prevAlarmRaw[idx] = (uint8_t)alarm;

    /* Main logic */
    if (s_doors[idx].alarming)
    {
        applySignaling(door1based, closed, idx);
    }
    else
    {
        applyNormal(door1based);
        s_doors[idx].locked = 0U;
    }

    /* Hard safety invariant: if open -> always unlock */
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
        AppHealth_Heartbeat(TASK_DOOR);

        for (uint8_t d = 1; d <= APP_DOOR_MAX; d++)
            updateOneDoor(d);

        osDelay(20);
    }
}
