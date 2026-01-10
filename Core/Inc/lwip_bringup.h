#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/*
 * LwIP bring-up helpers (Stage-5 проверка) — Stage-2 совместимый API.
 *
 * ВАЖНО:
 * - НЕ создаёт задач внутри себя.
 * - Init() вызывается один раз из NetTask после MX_LWIP_Init()
 * - Poll() вызывается периодически из NetTask (например, каждые 50..200мс)
 */

void LwIP_BringUp_Init(void);
void LwIP_BringUp_Poll(void);

#ifdef __cplusplus
}
#endif
