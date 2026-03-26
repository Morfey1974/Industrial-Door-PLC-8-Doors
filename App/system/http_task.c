#include "http_task.h"

#include "cmsis_os.h"

#include "app_health.h"
#include "net_service.h"
#include "system_node.h"

#include "http_server.h"
#include "app_log.h"
#include "net_link_signal.h"
#include "stm32h7xx_hal.h"

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

    /* Порт берём из активной конфигурации (если 0 — дефолт 80). */
    uint16_t port = Net_GetWebPort();
    if (port == 0U) port = 80U;

    /* Состояние сервера в рантайме:
     * - при потере сети закрываем listen-сокет;
     * - при возврате сети поднимаем сервер заново.
     * Это позволяет переживать Ethernet link flap без reboot контроллера.
     */
    uint8_t is_net_stable_up = 0U;
    uint8_t server_started = 0U;
    /* Антидребезг линка:
     * Чтобы при "шатающемся" кабеле не дергать сервер на каждом кратком
     * скачке состояния, требуем несколько подряд одинаковых опросов.
     * Цикл задачи ~40мс (PollOnce 20мс + osDelay 20мс), значит:
     * - 3 подтверждения ~= 120мс устойчивого состояния.
     */
    uint8_t stable_up_count = 0U;
    uint8_t stable_down_count = 0U;
    enum { NET_STABLE_TICKS = 3U };
    /* Ограничение частоты ре-инициализации HTTP.
     * При bind errno=98 (EADDRINUSE) нельзя долбить Init каждый 20мс:
     * это только засоряет лог и мешает TCP стеку освободить PCB.
     */
    uint32_t next_http_init_try_ms = 0U;

    for (;;)
    {
        AppHealth_Heartbeat(TASK_HTTP);

        /* Физические фронты link (tcpip_callback + опрос 500 мс). Схлопываем пачку за тик;
         * забор счётчиков только через NetLink_FetchAndClearEdges (атомарно с Notify). */
        {
            uint32_t phy_down_n = 0U;
            uint32_t phy_up_n = 0U;
            NetLink_FetchAndClearEdges(&phy_down_n, &phy_up_n);
            if (phy_down_n > 0U || phy_up_n > 0U)
            {
                if (phy_down_n > 0U)
                {
                    if (phy_down_n > 1U) {
                        AppLog("HTTP: PHY DOWN -> stop server (x%lu)", (unsigned long)phy_down_n);
                    } else {
                        AppLog("HTTP: PHY DOWN -> stop server");
                    }
                    HttpServer_Deinit();
                    server_started = 0U;
                    is_net_stable_up = 0U;
                    stable_up_count = 0U;
                    stable_down_count = NET_STABLE_TICKS;
                }
                if (phy_up_n > 0U)
                {
                    if (phy_up_n > 1U) {
                        AppLog("HTTP: PHY UP -> restart port %u (x%lu)", (unsigned)port, (unsigned long)phy_up_n);
                    } else {
                        AppLog("HTTP: PHY UP -> restart server on port %u", (unsigned)port);
                    }
                    /* Один раз после пачки фронтов: tcpip + HAL успевают без N×250мс блокировки. */
                    osDelay(250);
                    HttpServer_Deinit();
                    HttpServer_Init(port);
                    server_started = HttpServer_IsReady();
                    is_net_stable_up = server_started ? 1U : 0U;
                    stable_down_count = 0U;
                    stable_up_count = NET_STABLE_TICKS;
                    if (!server_started)
                    {
                        next_http_init_try_ms = HAL_GetTick() + 1000U;
                    }
                }
            }
        }

        const uint8_t net_ready = Net_IsReady();

        /* Накопление подтверждений для устойчивого UP/DOWN. */
        if (net_ready)
        {
            if (stable_up_count < 255U) stable_up_count++;
            stable_down_count = 0U;
        }
        else
        {
            if (stable_down_count < 255U) stable_down_count++;
            stable_up_count = 0U;
        }

        /* Сеть пропала: обязательно останавливаем HTTP, чтобы не держать
         * потенциально "битый" listen-сокет после разрыва линка.
         */
        if (stable_down_count >= NET_STABLE_TICKS)
        {
            /* Не гасим listen при кратком «логическом» down (IP/DHCP), если PHY линк ещё up —
             * иначе после этого bind поднимается без полноценного restart MAC и UI не открывается. */
            if (!Net_IsLinkUp())
            {
                if (is_net_stable_up || server_started)
                {
                    AppLog("HTTP: network lost, stop server");
                    HttpServer_Deinit();
                    server_started = 0U;
                }
                is_net_stable_up = 0U;
                osDelay(50);
                continue;
            }
            /* Линк физически есть — не блокируем цикл: иначе PollOnce не вызывается и accept «замирает». */
            osDelay(50);
        }

        /* Сеть появилась (или сервер ещё не поднят): пытаемся поднять HTTP.
         * Если Init не удался (сокет не открылся), повторим на следующем цикле.
         */
        if (stable_up_count < NET_STABLE_TICKS)
        {
            /* Линк еще не стабилен, ждем подтверждения без перезапуска HTTP. */
            osDelay(50);
            continue;
        }

        /* Поднимаем HTTP только при реальном link up (PHY), иначе Net_IsReady()
         * может кратковременно «мигать» true при обрыве кабеля — тогда bind даёт EADDRINUSE
         * и забивает лог.
         */
        if (!is_net_stable_up
            && (int32_t)(HAL_GetTick() - next_http_init_try_ms) >= 0
            && Net_IsLinkUp()
            && net_ready
            && stable_up_count >= NET_STABLE_TICKS)
        {
            AppLog("HTTP: network ready, start server on port %u", (unsigned)port);
            /* Как при PHY UP: дать стеку и MAC стабилизироваться после flap. */
            osDelay(250);
            HttpServer_Deinit();
            HttpServer_Init(port);
            server_started = HttpServer_IsReady();
            is_net_stable_up = server_started ? 1U : 0U;
            if (!server_started)
            {
                next_http_init_try_ms = HAL_GetTick() + 1000U;
            }
        }

        /* Если сервер внезапно не готов (например после ошибки select),
         * пробуем поднять снова в рабочем состоянии сети.
         */
        if (!server_started || !HttpServer_IsReady())
        {
            uint32_t now = HAL_GetTick();
            if ((int32_t)(now - next_http_init_try_ms) >= 0)
            {
                HttpServer_Init(port);
                server_started = HttpServer_IsReady();
                if (!server_started)
                {
                    next_http_init_try_ms = now + 1000U;
                }
            }
        }

        if (!server_started)
        {
            /* Даем паузу и повторяем попытку инициализации в следующем цикле. */
            osDelay(100);
            continue;
        }

        /* Обслуживаем максимум 1 клиента за итерацию, чтобы не съедать CPU.
         * Timeout небольшой — если никто не подключается, быстро возвращаемся.
         */
        HttpServer_PollOnce(20 /*ms*/);

        osDelay(20);
    }
}
