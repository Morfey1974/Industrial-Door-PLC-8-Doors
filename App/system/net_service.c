#include "net_service.h"

#include <stdio.h>
#include <string.h>

#include "lwip/netif.h"
#include "lwip/ip4_addr.h"

#include "config/config_format.h" /* project_config_t */
#include "system_node.h"

/* В CubeMX проекте обычно есть глобальный netif с именем gnetif (lwip.c) */
extern struct netif gnetif;

/* Конфигурация проекта (Этап 7) — хранится в ConfigService */
extern project_config_t g_project_cfg;

uint8_t Net_IsLinkUp(void)
{
    return (netif_is_link_up(&gnetif) != 0) ? 1U : 0U;
}

uint32_t Net_GetIp4(void)
{
    const ip4_addr_t *ip = netif_ip4_addr(&gnetif);
    if (!ip) return 0U;
    return ip->addr; /* already in lwIP internal representation */
}

uint8_t Net_IsReady(void)
{
    if (!Net_IsLinkUp()) return 0U;
    if (!netif_is_up(&gnetif)) return 0U;

    const ip4_addr_t *ip = netif_ip4_addr(&gnetif);
    if (!ip || ip->addr == 0U) return 0U;
    return 1U;
}

void Net_GetIp4Str(char *out, uint32_t out_sz)
{
    if (!out || out_sz < 16U) return;

    const ip4_addr_t *ip = netif_ip4_addr(&gnetif);
    if (!ip || ip->addr == 0U)
    {
        (void)strncpy(out, "0.0.0.0", out_sz);
        out[out_sz - 1U] = 0;
        return;
    }

    /* ip4_addr1..4 — safe macros, give octets */
    (void)snprintf(out, (size_t)out_sz, "%u.%u.%u.%u",
                   (unsigned)ip4_addr1(ip),
                   (unsigned)ip4_addr2(ip),
                   (unsigned)ip4_addr3(ip),
                   (unsigned)ip4_addr4(ip));
}

uint16_t Net_GetWebPort(void)
{
    /* По плану WEB только на MASTER */
    if (System_GetRole() != APP_ROLE_MASTER) return 0U;
    return g_project_cfg.net.webPort;
}
