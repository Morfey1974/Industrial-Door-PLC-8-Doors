#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* =========================================================
 * ЭТАП 9.1 — Net service (тонкая прослойка над lwIP bring-up)
 *
 * Задача NetTask уже вызывает LwIP_BringUp_Poll() и печатает
 * диагностику (LINK/NETIF/IP). Для HTTP-сервера и других модулей
 * удобно иметь единый API:
 *   - готова ли сеть;
 *   - какой IP;
 *   - какой web-port (из конфигурации).
 * ========================================================= */

/* 1 если есть link up, netif up и IP != 0.0.0.0 */
uint8_t Net_IsReady(void);

/* 1 если link поднят */
uint8_t Net_IsLinkUp(void);

/* Текущий IPv4 адрес (как uint32_t в сетевом порядке). 0 если нет. */
uint32_t Net_GetIp4(void);

/* Форматирует IPv4 в строку "a.b.c.d".
 * out_sz должен быть >= 16.
 */
void Net_GetIp4Str(char *out, uint32_t out_sz);

/* WEB port берём из активного конфига (g_project_cfg.net.webPort).
 * На slave возвращаем 0.
 */
uint16_t Net_GetWebPort(void);

#ifdef __cplusplus
}
#endif
