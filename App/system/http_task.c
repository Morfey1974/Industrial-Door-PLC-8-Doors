#include "http_task.h"

#include "cmsis_os.h"
#include "stm32h7xx_hal.h"

#include "app_health.h"
#include "app_log.h"
#include "http_server.h"
#include "net_service.h"

/* =============================================================================
 * Задача HTTP: listen как только lwIP выдал netif + статический IP (Net_IsStackReady).
 * Не ждём PHY/link (Net_IsReady) — иначе HTTP стартует только после автосогласования,
 * браузер долго «не видит» контроллер при уже работающем стеке.
 * Состояние «сеть жива» для JSON по-прежнему через Net_IsReady в /api/state.
 * ============================================================================= */

void HttpTask_Run(void const *argument)
{
    (void)argument;

    uint16_t port = Net_GetWebPort();
    if (port == 0U) {
        port = 80U;
    }

    /* Пока netTask не выполнил MX_LWIP_Init(), netif и tcpip-мbox ещё нет — не трогаем сокеты. */
    while (Net_IsStackReady() == 0U) {
        AppHealth_Heartbeat(TASK_HTTP);
        osDelay(10);
    }

    for (;;) {
        AppHealth_Heartbeat(TASK_HTTP);

        if (HttpServer_IsReady() == 0U) {
            HttpServer_Init(port);
            osDelay(20);
            continue;
        }

        /* Если обслужили клиента, заходим на следующий круг сразу (съедаем очередь запросов).
         * Если клиентов нет — спим 10мс, чтобы не "съедать" CPU. */
        if (HttpServer_PollOnce(15U) == 0U) {
            osDelay(10);
        }
    }
}
