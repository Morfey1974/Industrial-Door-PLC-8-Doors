#pragma once

#include <stdint.h>
#include "stm32h7xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * QSPI/NOR flash primitives over OCTOSPI1 (verified on hardware).
 *
 * Bring-up LED test task was removed. This module provides reusable
 * low-level primitives for configuration/log storage:
 *  - Read JEDEC ID
 *  - Erase 4KB sector
 *  - Program up to 256 bytes (page)
 *  - Read arbitrary bytes
 *
 * All commands are 1-1-1 (single-line) to avoid QE/quad dependencies.
 */

HAL_StatusTypeDef QSPI_Flash_ReadJEDEC(uint8_t id3[3]);
HAL_StatusTypeDef QSPI_Flash_Erase4K(uint32_t addr);
HAL_StatusTypeDef QSPI_Flash_ProgramPage(uint32_t addr, const uint8_t *data, uint32_t len);
HAL_StatusTypeDef QSPI_Flash_Read(uint32_t addr, uint8_t *data, uint32_t len);

#ifdef __cplusplus
}
#endif
