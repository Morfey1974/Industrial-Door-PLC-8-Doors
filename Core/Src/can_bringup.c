#include "can_bringup.h"

#include "cmsis_os.h"          /* CMSIS-RTOS v1 */
#include "fdcan.h"
#include "bsp_doors_io.h"
#include <stdint.h>
#include <stdbool.h>

/* ============================================================
   ВАЖНО:
   Чтобы НЕ БЫЛО warning'ов, когда bring-up отключён,
   мы компилируем задачи/хелперы ТОЛЬКО при CAN_BRINGUP_ENABLE==1.
   ============================================================ */

#if (CAN_BRINGUP_ENABLE == 0)

/* Bring-up выключен: никаких задач не создаём, ничего не компилируем лишнего. */
void CAN_BringUp_Start(void)
{
    return;
}

#else /* CAN_BRINGUP_ENABLE == 1 */

/* ============================================================
   ВЫБОР РОЛИ (две прошивки)
   ------------------------------------------------------------
   MASTER = 1
   SLAVE  = 0
   ============================================================ */
#define CAN_ROLE_IS_MASTER   1   /* <-- MASTER=1, SLAVE=0 */

/* FDCAN handle из fdcan.c */
extern FDCAN_HandleTypeDef hfdcan1;

/* Чтобы doors_task не перетирал индикацию на SLAVE */
extern osThreadId doorsTaskHandle;

/* CAN параметры */
#define CAN_HEARTBEAT_ID       (0x100U)
#define CAN_HEARTBEAT_PERIOD   (500U)   /* мс */
#define CAN_OFFLINE_TIMEOUT    (1500U)  /* мс */

#if (CAN_ROLE_IS_MASTER == 1)

/* ---------------- MASTER ----------------
   Раз в 500мс отправляем heartbeat кадр (ID 0x100, 8 байт).
*/
static void CAN_MasterTask(void const *argument)
{
    (void)argument;

    FDCAN_TxHeaderTypeDef tx = {0};
    uint8_t data[8] = {0};
    uint32_t counter = 0;

    tx.Identifier          = CAN_HEARTBEAT_ID;
    tx.IdType              = FDCAN_STANDARD_ID;
    tx.TxFrameType         = FDCAN_DATA_FRAME;
    tx.DataLength          = FDCAN_DLC_BYTES_8;
    tx.ErrorStateIndicator = FDCAN_ESI_ACTIVE;
    tx.BitRateSwitch       = FDCAN_BRS_OFF;
    tx.FDFormat            = FDCAN_CLASSIC_CAN;
    tx.TxEventFifoControl  = FDCAN_NO_TX_EVENTS;
    tx.MessageMarker       = 0;

    (void)HAL_FDCAN_Start(&hfdcan1);

    for (;;)
    {
        data[0] = (uint8_t)(counter & 0xFF);
        data[1] = (uint8_t)((counter >> 8) & 0xFF);
        counter++;

        if (HAL_FDCAN_GetTxFifoFreeLevel(&hfdcan1) > 0)
        {
            (void)HAL_FDCAN_AddMessageToTxFifoQ(&hfdcan1, &tx, data);
        }

        osDelay(CAN_HEARTBEAT_PERIOD);
    }
}

#else  /* ---------------- SLAVE ---------------- */

/* Локальные хелперы только для SLAVE (чтобы не было unused в MASTER сборке) */
static uint32_t now_ms(void)
{
    return HAL_GetTick();
}

static void Door1_SetGreen(void)
{
    BSP_DoorIO_SetLedMode(1, BSP_DOOR_LED_GREEN);
}

static void Door1_SetRed(void)
{
    BSP_DoorIO_SetLedMode(1, BSP_DOOR_LED_RED);
}

static void Door1_LedsOff(void)
{
    BSP_DoorIO_SetLedMode(1, BSP_DOOR_LED_OFF);
}

/* SLAVE:
   - принимает heartbeat (ID 0x100) из RX FIFO0
   - обновляет last_seen
   - online: зелёный, offline: красный
*/
static void CAN_SlaveTask(void const *argument)
{
    (void)argument;

    FDCAN_RxHeaderTypeDef rx;
    uint8_t data[8];
    uint32_t last_seen = 0;

    if (doorsTaskHandle != NULL)
    {
        osThreadSuspend(doorsTaskHandle);
    }

    BSP_DoorIO_SetLocked(1, false);
    BSP_DoorIO_SetBuzzer(1, false);
    Door1_LedsOff();

    /* Фильтр: принимаем только heartbeat ID */
    FDCAN_FilterTypeDef filter = {0};
    filter.IdType       = FDCAN_STANDARD_ID;
    filter.FilterIndex  = 0;
    filter.FilterType   = FDCAN_FILTER_MASK;
    filter.FilterConfig = FDCAN_FILTER_TO_RXFIFO0;
    filter.FilterID1    = CAN_HEARTBEAT_ID;
    filter.FilterID2    = 0x7FF;

    (void)HAL_FDCAN_ConfigFilter(&hfdcan1, &filter);
    (void)HAL_FDCAN_Start(&hfdcan1);

    for (;;)
    {
        if (HAL_FDCAN_GetRxFifoFillLevel(&hfdcan1, FDCAN_RX_FIFO0) > 0)
        {
            if (HAL_FDCAN_GetRxMessage(&hfdcan1, FDCAN_RX_FIFO0, &rx, data) == HAL_OK)
            {
                if (rx.Identifier == CAN_HEARTBEAT_ID)
                {
                    last_seen = now_ms();
                }
            }
        }

        if ((now_ms() - last_seen) <= CAN_OFFLINE_TIMEOUT)
            Door1_SetGreen();
        else
            Door1_SetRed();

        osDelay(20);
    }
}

#endif /* ROLE */

/* ---------------- START ---------------- */
void CAN_BringUp_Start(void)
{
#if (CAN_ROLE_IS_MASTER == 1)
    osThreadDef(canMaster, CAN_MasterTask, osPriorityNormal, 0, 256);
    (void)osThreadCreate(osThread(canMaster), NULL);
#else
    osThreadDef(canSlave, CAN_SlaveTask, osPriorityNormal, 0, 256);
    (void)osThreadCreate(osThread(canSlave), NULL);
#endif
}

#endif /* CAN_BRINGUP_ENABLE */
