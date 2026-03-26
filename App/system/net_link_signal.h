#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Сигналы смены физического Ethernet link (PHY), наблюдаемые в LwIP_BringUp_Poll().
 *
 * Зачем:
 * - Net_IsReady() (link + netif + IP) может оставаться true при кратком обрыве или
 *   из-за рассинхрона флагов lwIP, тогда HttpTask не вызывает HttpServer_Deinit()
 *   и listen-сокет остаётся в «битом» состоянии после link flap.
 * - Счётчики фронтов DOWN/UP дают HttpTask явную команду: закрыть/переоткрыть HTTP
 *   независимо от Net_IsReady().
 *
 * Пишут ethernetif (tcpip_callback) и LwIP_BringUp_Poll; читает HttpTask (схлопывает пачку за тик).
 */

void NetLink_NotifyPhyEdge(uint8_t link_up);

/* Атомарно: забрать накопленные фронты и обнулить счётчики (защита от гонки с Notify). */
void NetLink_FetchAndClearEdges(uint32_t *down_out, uint32_t *up_out);

/* Для отладки; основной путь — FetchAndClearEdges. */
extern volatile uint32_t g_netlink_phy_down_edges;
extern volatile uint32_t g_netlink_phy_up_edges;

#ifdef __cplusplus
}
#endif
