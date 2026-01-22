#include "http_task.h"

#include "cmsis_os.h"

#include "app_health.h"
#include "net_service.h"
#include "system_node.h"

#include "http_server.h"

/* =========================================================
 * ЭТАП 9 — Ethernet + HTTP/REST (минимальный сервер)
 *
 * Важно по плану:
 *  - HTTP поднимается ТОЛЬКО на MASTER-плате (NodeID=1).
 *  - RS-485 / CAN / Door control не должны зависеть от HTTP.
 *
 * Реализация:
 *  - HttpTask имеет низкий приоритет (настраивается в freertos.c).
 *  - Сокетный сервер (lwIP sockets), 1 соединение за итерацию.
 *  - Только read-only эндпоинты на этом шаге:
 *      GET /api/state
 *      GET /api/doors
 *      GET /api/config
 *      GET /api/journal/stat
 * ========================================================= */

void HttpTask_Run(void const *argument)
{
    (void)argument;

    /* По глобальному плану WEB только на MASTER (NodeID=1). */
    if (System_GetRole() != APP_ROLE_MASTER || System_GetNodeId() != 1U)
    {
        for (;;)
        {
            AppHealth_Heartbeat(TASK_HTTP);
            osDelay(500);
        }
    }

    /* Ждём, пока Ethernet поднимется (link + netif + IP). */
    while (!Net_IsReady())
    {
        AppHealth_Heartbeat(TASK_HTTP);
        osDelay(200);
    }

    /* Порт берём из активной конфигурации (если 0 — дефолт 80).
     * На этом этапе это удобно для теста (можно поставить 8080).
     */
    uint16_t port = Net_GetWebPort();
    if (port == 0U) port = 80U;

    HttpServer_Init(port);

    for (;;)
    {
        AppHealth_Heartbeat(TASK_HTTP);

        /* Обслуживаем максимум 1 клиента за итерацию, чтобы не съедать CPU.
         * Timeout небольшой — если никто не подключается, быстро возвращаемся.
         */
        HttpServer_PollOnce(20 /*ms*/);

        osDelay(20);
    }
}
