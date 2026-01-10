#include "lwip_bringup.h"

#include "lwip.h"

/* LwIP includes */
#include "lwip/netif.h"
#include "lwip/udp.h"
#include "lwip/ip4_addr.h"
#include <string.h>

/* В CubeMX проекте обычно есть глобальный netif с именем gnetif (lwip.c) */
extern struct netif gnetif;

/* =========================
   UDP "alive"
   ========================= */
#define ALIVE_UDP_PORT   7777

static struct udp_pcb *s_udp = NULL;

/* Monitor state */
static uint8_t   s_prev_link_up = 0;
static uint8_t   s_prev_if_up   = 0;
static ip4_addr_t s_prev_ip;
static uint32_t  s_lastPollMs   = 0;

static void print_ip(const ip4_addr_t *ip)
{
    printf("%lu ms | IP: %u.%u.%u.%u\r\n",
           (unsigned long)HAL_GetTick(),
           (unsigned)(ip4_addr1(ip)),
           (unsigned)(ip4_addr2(ip)),
           (unsigned)(ip4_addr3(ip)),
           (unsigned)(ip4_addr4(ip)));
}

static void alive_udp_recv(void *arg,
                           struct udp_pcb *pcb,
                           struct pbuf *p,
                           const ip_addr_t *addr,
                           u16_t port)
{
    (void)arg;

    if (p == NULL) return;

    const char *resp = "OK";
    if (p->len >= 6)
    {
        const char *d = (const char *)p->payload;
        if (d[0]=='A' && d[1]=='L' && d[2]=='I' && d[3]=='V' && d[4]=='E' && d[5]=='?')
            resp = "ALIVE";
    }

    struct pbuf *tx = pbuf_alloc(PBUF_TRANSPORT, (u16_t)strlen(resp), PBUF_RAM);
    if (tx != NULL)
    {
        memcpy(tx->payload, resp, strlen(resp));
        (void)udp_sendto(pcb, tx, addr, port);
        pbuf_free(tx);
    }

    pbuf_free(p);
}

static void alive_udp_start(void)
{
    if (s_udp != NULL)
        return;

    s_udp = udp_new_ip_type(IPADDR_TYPE_ANY);
    if (s_udp == NULL)
        return;

    if (udp_bind(s_udp, IP_ANY_TYPE, ALIVE_UDP_PORT) != ERR_OK)
    {
        udp_remove(s_udp);
        s_udp = NULL;
        return;
    }

    udp_recv(s_udp, alive_udp_recv, NULL);
}

void LwIP_BringUp_Init(void)
{
    memset(&s_prev_ip, 0, sizeof(s_prev_ip));
    s_prev_link_up = 0;
    s_prev_if_up   = 0;
    s_lastPollMs   = 0;

    alive_udp_start();
    printf("%lu ms | UDP alive on port %d\r\n",
           (unsigned long)HAL_GetTick(),
           (int)ALIVE_UDP_PORT);
}

/*
 * Poll раз в 500мс:
 * - следим за link up/down
 * - следим за netif up/down
 * - если IP изменился — печатаем
 */
void LwIP_BringUp_Poll(void)
{
    uint32_t now = HAL_GetTick();
    if ((now - s_lastPollMs) < 500U)
        return;
    s_lastPollMs = now;

    uint8_t link_up = netif_is_link_up(&gnetif) ? 1U : 0U;
    uint8_t if_up   = netif_is_up(&gnetif)      ? 1U : 0U;

    if (link_up != s_prev_link_up)
    {
        s_prev_link_up = link_up;
        printf("%lu ms | LINK %s\r\n",
               (unsigned long)HAL_GetTick(),
               link_up ? "UP" : "DOWN");
    }

    if (if_up != s_prev_if_up)
    {
        s_prev_if_up = if_up;
        printf("%lu ms | NETIF %s\r\n",
               (unsigned long)HAL_GetTick(),
               if_up ? "UP" : "DOWN");
    }

    const ip4_addr_t *ip = netif_ip4_addr(&gnetif);
    if (ip != NULL && ip->addr != s_prev_ip.addr)
    {
        s_prev_ip = *ip;
        print_ip(ip);
    }
}
