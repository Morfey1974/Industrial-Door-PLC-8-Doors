#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Заполняет буфер криптостойкими случайными байтами.
 * При включённом HAL RNG использует аппаратный RNG;
 * иначе — fallback на HAL_GetTick() (для production рекомендуется включить RNG в CubeMX).
 */
void SecureRandom_Fill(uint8_t *buf, size_t len);

#ifdef __cplusplus
}
#endif
