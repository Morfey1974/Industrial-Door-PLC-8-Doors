#include "can_bringup.h"

#include "fdcan.h"
#include <string.h>

/* FDCAN handle from fdcan.c */
extern FDCAN_HandleTypeDef hfdcan1;

/* Heartbeat tracking */
static volatile uint32_t s_hb_id = 0x100U;
static volatile uint32_t s_last_hb_ms = 0U;

static uint32_t now_ms(void)
{
    return HAL_GetTick();
}

void CAN_Heartbeat_SetId(uint32_t std_id)
{
    s_hb_id = std_id & 0x7FFU;
}

void CAN_Heartbeat_OnRx(uint32_t std_id)
{
    if ((std_id & 0x7FFU) == (s_hb_id & 0x7FFU))
    {
        s_last_hb_ms = now_ms();
    }
}

bool CAN_Heartbeat_IsOnline(uint32_t timeout_ms)
{
    uint32_t t = now_ms();
    return (t - s_last_hb_ms) <= timeout_ms;
}

HAL_StatusTypeDef CAN_Link_Init(void)
{
    if (hfdcan1.Instance == NULL)
        return HAL_ERROR;

    /* Minimal filter: accept ALL standard IDs to FIFO0 (application can tighten later). */
    FDCAN_FilterTypeDef filter = {0};
    filter.IdType       = FDCAN_STANDARD_ID;
    filter.FilterIndex  = 0;
    filter.FilterType   = FDCAN_FILTER_MASK;
    filter.FilterConfig = FDCAN_FILTER_TO_RXFIFO0;
    filter.FilterID1    = 0x000;     /* ID */
    filter.FilterID2    = 0x000;     /* mask = 0 => accept all */

    /* Some HAL versions require a non-zero mask; if you hit issues, set FilterID2=0x7FF and FilterID1=0. */
    if (HAL_FDCAN_ConfigFilter(&hfdcan1, &filter) != HAL_OK)
        return HAL_ERROR;

    /* Prepare default timestamp state */
    s_last_hb_ms = 0U;
    return HAL_OK;
}

HAL_StatusTypeDef CAN_Link_Start(void)
{
    if (HAL_FDCAN_Start(&hfdcan1) != HAL_OK)
        return HAL_ERROR;

    /* Enable RX FIFO0 new message interrupt (optional but useful for future). */
    (void)HAL_FDCAN_ActivateNotification(&hfdcan1, FDCAN_IT_RX_FIFO0_NEW_MESSAGE, 0);

    return HAL_OK;
}

HAL_StatusTypeDef CAN_Link_SendStd(uint32_t std_id, const uint8_t *data, uint8_t len, uint32_t timeout_ms)
{
    (void)timeout_ms; /* HAL_FDCAN_AddMessageToTxFifoQ is non-blocking */

    if (len > 8U)
        return HAL_ERROR;

    FDCAN_TxHeaderTypeDef tx = {0};

    tx.Identifier          = (std_id & 0x7FFU);
    tx.IdType              = FDCAN_STANDARD_ID;
    tx.TxFrameType         = FDCAN_DATA_FRAME;
    tx.ErrorStateIndicator = FDCAN_ESI_ACTIVE;
    tx.BitRateSwitch       = FDCAN_BRS_OFF;
    tx.FDFormat            = FDCAN_CLASSIC_CAN;
    tx.TxEventFifoControl  = FDCAN_NO_TX_EVENTS;
    tx.MessageMarker       = 0;

    /* DLC mapping */
    switch (len)
    {
        case 0: tx.DataLength = FDCAN_DLC_BYTES_0; break;
        case 1: tx.DataLength = FDCAN_DLC_BYTES_1; break;
        case 2: tx.DataLength = FDCAN_DLC_BYTES_2; break;
        case 3: tx.DataLength = FDCAN_DLC_BYTES_3; break;
        case 4: tx.DataLength = FDCAN_DLC_BYTES_4; break;
        case 5: tx.DataLength = FDCAN_DLC_BYTES_5; break;
        case 6: tx.DataLength = FDCAN_DLC_BYTES_6; break;
        case 7: tx.DataLength = FDCAN_DLC_BYTES_7; break;
        default: tx.DataLength = FDCAN_DLC_BYTES_8; break;
    }

    if (HAL_FDCAN_GetTxFifoFreeLevel(&hfdcan1) == 0U)
        return HAL_BUSY;

    return HAL_FDCAN_AddMessageToTxFifoQ(&hfdcan1, &tx, (uint8_t*)data);
}

/* Optional: hook into global RX callback
   Put this into your stm32h7xx_it / user code area when ready:

   void HAL_FDCAN_RxFifo0Callback(FDCAN_HandleTypeDef *hfdcan, uint32_t RxFifo0ITs)
   {
       if ((RxFifo0ITs & FDCAN_IT_RX_FIFO0_NEW_MESSAGE) != 0U)
       {
           FDCAN_RxHeaderTypeDef rx;
           uint8_t data[8];
           if (HAL_FDCAN_GetRxMessage(hfdcan, FDCAN_RX_FIFO0, &rx, data) == HAL_OK)
           {
               CAN_Heartbeat_OnRx(rx.Identifier);
               // ... dispatch application messages ...
           }
       }
   }
*/
