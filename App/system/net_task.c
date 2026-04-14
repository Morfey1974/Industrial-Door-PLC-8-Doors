#include "net_task.h"

#include <stdio.h>
#include <string.h>

#include "cmsis_os.h"
#include "lwip.h"
#include "lwip_bringup.h"
#include "lwip/netif.h"
#include "lwip/ip4_addr.h"
#include "app_health.h"

#include "config/config_format.h"

/* Реализация API из net_service.h (раньше был отдельный net_service.c). */
#include "net_service.h"

/* В CubeMX проекте обычно есть глобальный netif с именем gnetif (lwip.c). */
extern struct netif gnetif;

extern project_config_t g_project_cfg;

void NetTask_Run(void const *argument)
{
    (void)argument;


    /* bring-up: UDP alive + link/netif/ip monitor (без создания задач!) */
    LwIP_BringUp_Init();

    for (;;)
    {
        AppHealth_Heartbeat(TASK_NET);

        LwIP_BringUp_Poll();

        osDelay(50);
    }
}

/* ---------- net_service (lwIP gnetif + конфиг порта) ---------- */

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

uint8_t Net_IsStackReady(void)
{
    if (!netif_is_up(&gnetif)) {
        return 0U;
    }
    const ip4_addr_t *ip = netif_ip4_addr(&gnetif);
    if (!ip || ip->addr == 0U) {
        return 0U;
    }
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

    (void)snprintf(out, (size_t)out_sz, "%u.%u.%u.%u",
                   (unsigned)ip4_addr1(ip),
                   (unsigned)ip4_addr2(ip),
                   (unsigned)ip4_addr3(ip),
                   (unsigned)ip4_addr4(ip));
}

uint16_t Net_GetWebPort(void)
{
    return g_project_cfg.net.webPort;
}
