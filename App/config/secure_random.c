/**
 * Генерация случайных байт для соли и токенов.
 * При HAL_RNG_MODULE_ENABLED и наличии hrng — используется HAL RNG (включите RNG в CubeMX и добавьте stm32h7xx_hal_rng.c).
 * Иначе — fallback на HAL_GetTick() с перемешиванием (для production рекомендуется включить RNG).
 */

#include "secure_random.h"
#include <stdint.h>
#include <string.h>

#ifdef HAL_RNG_MODULE_ENABLED
#include "stm32h7xx_hal.h"
/* Глобальный handle RNG, создаётся при включении RNG в CubeMX (MX_RNG_Init) */
extern RNG_HandleTypeDef hrng;
#endif

void SecureRandom_Fill(uint8_t *buf, size_t len)
{
	if (!buf || len == 0) return;

#ifdef HAL_RNG_MODULE_ENABLED
	/* Аппаратный RNG: по 4 байта за вызов */
	{
		size_t filled = 0;
		uint32_t r;
		while (filled < len && HAL_RNG_GenerateRandomNumber(&hrng, &r) == HAL_OK) {
			size_t n = len - filled;
			if (n > 4) n = 4;
			memcpy(buf + filled, &r, n);
			filled += n;
		}
		if (filled >= len) return;
	}
#endif

	/* Fallback: HAL_GetTick() и перемешивание (не криптостойко, только для отладки/отсутствия RNG) */
	extern uint32_t HAL_GetTick(void);
	uint32_t t = HAL_GetTick();
	for (size_t i = 0; i < len; i++) {
		t = t * 1103515245U + 12345U;
		t ^= (t >> 16);
		t += (uint32_t)i * 0x9e3779b9U;
		buf[i] = (uint8_t)(t >> 24);
	}
}
