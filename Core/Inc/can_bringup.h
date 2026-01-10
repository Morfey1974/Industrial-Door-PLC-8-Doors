#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "stm32h7xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * CAN link layer on FDCAN1 (Classic CAN @ 500 kbit/s, as verified in bring-up).
 *
 * Bring-up demo (Door1 LED green/red online/offline) has been removed.
 * This module now provides:
 *  - initialization (filters + start)
 *  - send helper
 *  - optional "peer online" detection via heartbeat reception timestamps
 *
 * Policy:
 *  - Application decides message IDs and payloads.
 *  - This layer offers a minimal "heartbeat seen" helper to re-use later.
 */

/* Call once after MX_FDCAN1_Init() */
HAL_StatusTypeDef CAN_Link_Init(void);

/* Start peripheral + enable RX notifications */
HAL_StatusTypeDef CAN_Link_Start(void);

/* Send Classic CAN data frame (len: 0..8) */
HAL_StatusTypeDef CAN_Link_SendStd(uint32_t std_id, const uint8_t *data, uint8_t len, uint32_t timeout_ms);

/* --- Optional heartbeat helper ------------------------------------------- */

/* Configure which Standard ID is considered "heartbeat" to update online status. */
void CAN_Heartbeat_SetId(uint32_t std_id);

/* Call from RX callback when you receive a message; updates online timestamp if ID matches. */
void CAN_Heartbeat_OnRx(uint32_t std_id);

/* Returns true if heartbeat received within timeout_ms. */
bool CAN_Heartbeat_IsOnline(uint32_t timeout_ms);

#ifdef __cplusplus
}
#endif
