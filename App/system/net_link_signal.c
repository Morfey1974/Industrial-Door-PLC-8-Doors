#include "net_link_signal.h"

#include "FreeRTOS.h"
#include "task.h"

/* Счётчики фронтов PHY link; инкремент — tcpip/NetTask, забор — HttpTask. */
volatile uint32_t g_netlink_phy_down_edges = 0U;
volatile uint32_t g_netlink_phy_up_edges = 0U;

void NetLink_NotifyPhyEdge(uint8_t link_up)
{
    /* Короткая критическая секция: иначе между чтением и обнулением в HttpTask
     * теряется новый фронт — сеть «не поднимается» после кабеля при живом линке в логе. */
    taskENTER_CRITICAL();
    if (link_up != 0U)
    {
        g_netlink_phy_up_edges++;
    }
    else
    {
        g_netlink_phy_down_edges++;
    }
    taskEXIT_CRITICAL();
}

void NetLink_FetchAndClearEdges(uint32_t *down_out, uint32_t *up_out)
{
    if (down_out == NULL || up_out == NULL) {
        return;
    }
    taskENTER_CRITICAL();
    *down_out = g_netlink_phy_down_edges;
    *up_out = g_netlink_phy_up_edges;
    g_netlink_phy_down_edges = 0U;
    g_netlink_phy_up_edges = 0U;
    taskEXIT_CRITICAL();
}
