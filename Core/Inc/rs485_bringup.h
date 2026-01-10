#pragma once

#include <stdint.h>
#include "stm32h7xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * RS-485 transport wrapper (UART4 + DE on PA15)
 *
 * Bring-up demo (LED ON/OFF over RS-485) has been removed.
 * This module is now a small, reusable transport layer that the
 * future Modbus/your protocol will sit on top of.
 *
 * CubeMX already initializes UART4 in RS-485 mode via:
 *   HAL_RS485Ex_Init(&huart4, UART_DE_POLARITY_HIGH, 0, 0);
 */

/* Initialize/verify UART4 is ready (safe to call multiple times). */
HAL_StatusTypeDef RS485_Init(void);

/* Blocking transmit (DE is handled by HW RS-485 mode). */
HAL_StatusTypeDef RS485_Tx(const uint8_t *data, uint16_t len, uint32_t timeout_ms);

/* Blocking receive. Returns HAL_TIMEOUT if nothing received within timeout. */
HAL_StatusTypeDef RS485_Rx(uint8_t *data, uint16_t len, uint32_t timeout_ms);

#ifdef __cplusplus
}
#endif
