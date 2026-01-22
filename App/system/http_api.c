#include "http_api.h"

#include <stdio.h>
#include <stdarg.h>
#include <string.h>

#include "stm32h7xx_hal.h"

#include "app_log.h"
#include "http_server.h"

#include "doors/doors_task.h"
#include "log/event_journal.h"
#include "system_node.h"
#include "net_service.h"

#include "config/config_format.h"

/* Draft JSON merge parser (Stage 9): */
#include "json_simple.h"

/* Stage 7 service: atomic A/B persist to QSPI + journal event */
#include "config_service.h"

/* Active configuration stored by ConfigService (Этап 7) */
extern project_config_t g_project_cfg;

/* =========================================================
 * Маленький helper для безопасного append в JSON buffer.
 *
 * Важно:
 *  - мы не используем malloc;
 *  - если out buffer заполнен — возвращаем ошибку (500).
 * ========================================================= */

typedef struct {
    char *buf;
    size_t cap;
    size_t len; /* Фактическая длина данных (без нулевого терминатора) */
} jsonw_t;

static void jw_init(jsonw_t *w, char *buf, size_t cap)
{
    w->buf = buf;
    w->cap = cap;
    w->len = 0;
    if (w->cap) {
        w->buf[0] = 0; /* Инициализируем как пустую строку */
    }
}

static uint8_t jw_appendf(jsonw_t *w, const char *fmt, ...)
{
    if (!w || !w->buf || w->cap == 0) return 0U;
    if (w->len >= w->cap) return 0U;

    va_list ap;
    va_start(ap, fmt);
    const int n = vsnprintf(w->buf + w->len, w->cap - w->len, fmt, ap);
    va_end(ap);

    if (n < 0) return 0U;
    if ((size_t)n >= (w->cap - w->len)) {
        /* Буфер переполнен - гарантируем нулевой терминатор */
        if (w->cap > 0) {
            w->buf[w->cap - 1] = 0;
        }
        return 0U;
    }
    w->len += (size_t)n;
    /* vsnprintf всегда добавляет нулевой терминатор, но убедимся */
    if (w->len < w->cap) {
        w->buf[w->len] = 0;
    }
    return 1U;
}

static uint32_t safe_uptime_s(void)
{
    /* HAL_GetTick() wrap-around ~ 49 дней при 1ms. Для мониторинга достаточно. */
    return HAL_GetTick() / 1000U;
}

static uint8_t build_state(jsonw_t *w)
{
    char ip[16];
    Net_GetIp4Str(ip, sizeof(ip));

    /* На этом шаге state — минимальный.
     * Позже сюда добавим CAN state/mask, degraded flags, и т.д.
     */
    return jw_appendf(w,
        "{"
          "\"nodeId\":%u,"
          "\"role\":%u,"
          "\"linkUp\":%u,"
          "\"netReady\":%u,"
          "\"ip\":\"%s\","
          "\"uptimeSeconds\":%lu"
        "}",
        (unsigned)System_GetNodeId(),
        (unsigned)System_GetRole(),
        (unsigned)Net_IsLinkUp(),
        (unsigned)Net_IsReady(),
        ip,
        (unsigned long)safe_uptime_s()
    );
}

static uint8_t build_doors(jsonw_t *w)
{
    const uint32_t now = HAL_GetTick();

#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
    AppLog("HTTP: build_doors start");
#endif

    if (!jw_appendf(w, "{\"doors\":[")) return 0U;

    /* Оптимизация: используем Doors_GetStateArrayLocked для получения всех данных
     * за один захват мьютекса вместо 8 отдельных вызовов Doors_GetState.
     * Это значительно ускоряет обработку запроса и предотвращает блокировки.
     */
    AppDoorState_t *doors_array = Doors_GetStateArrayLocked();
    if (!doors_array) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
        AppLog("HTTP: build_doors mutex timeout!");
#endif
        /* Если не удалось захватить мьютекс, возвращаем пустой список.
         * Это лучше, чем зависание или ошибка 500.
         */
        if (!jw_appendf(w, "]}")) return 0U;
        return 1U; /* Успешно создали пустой JSON */
    }

    for (uint8_t i = 1; i <= APP_DOOR_MAX; i++)
    {
        uint8_t idx = (uint8_t)(i - 1U);
        AppDoorState_t st = doors_array[idx];
        const uint8_t ok = 1U; /* Данные всегда доступны при использовании массива */

        /* openSeconds: если дверь открыта — сколько секунд прошло с момента openSinceMs */
        uint32_t open_s = 0U;
        if (ok && st.physClosed == 0U && st.openSinceMs != 0U) {
            const uint32_t dt = (now - st.openSinceMs);
            open_s = dt / 1000U;
        }

        /* closeDelayRemainingSeconds */
        uint32_t close_rem_s = 0U;
        if (ok && st.postClosePending && st.postCloseTimeoutMs != 0U) {
            const uint32_t passed = (now - st.postCloseStartMs);
            if (passed < st.postCloseTimeoutMs) {
                close_rem_s = (st.postCloseTimeoutMs - passed) / 1000U;
            }
        }

        if (i != 1) {
            if (!jw_appendf(w, ",")) return 0U;
        }

        /* В JSON отдаём и "сырые" поля, и удобные вычисляемые значения.
         * UI может использовать что ему проще.
         */
        if (!jw_appendf(w,
            "{"
              "\"id\":%u,"
              "\"physClosed\":%u,"
              "\"locked\":%u,"
              "\"alarming\":%u,"
              "\"alarmReasons\":%lu,"
              "\"openSeconds\":%lu,"
              "\"closeDelayRemainingSeconds\":%lu"
            "}",
            (unsigned)i,
            (unsigned)(ok ? st.physClosed : 0U),
            (unsigned)(ok ? st.locked : 0U),
            (unsigned)(ok ? st.alarming : 0U),
            (unsigned long)(ok ? st.alarmReasons : 0UL),
            (unsigned long)open_s,
            (unsigned long)close_rem_s
        )) {
            Doors_ReleaseStateArray(); /* Освобождаем мьютекс при ошибке */
            return 0U;
        }
    }

    /* Освобождаем мьютекс после чтения всех данных */
    Doors_ReleaseStateArray();

    uint8_t result = jw_appendf(w, "]}");
    
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
    AppLog("HTTP: build_doors done len=%u result=%u", (unsigned)w->len, (unsigned)result);
#endif

    return result;
}

static uint8_t build_config(jsonw_t *w)
{
    /* На этом шаге: отдаём только часть полей, достаточную для теста.
     * Полный конфиг большой (до 80 дверей + edges) — можно расширить позже.
     */
    return jw_appendf(w,
        "{"
          "\"formatVersion\":%lu,"
          "\"seq\":%lu,"
          "\"projectName\":\"%s\","
          "\"doorCount\":%u,"
          "\"openTimeoutMs\":%lu,"
          "\"net\":{\"dhcpEnabled\":%u,\"webPort\":%u}"
        "}",
        (unsigned long)g_project_cfg.formatVersion,
        (unsigned long)g_project_cfg.seq,
        g_project_cfg.projectName,
        (unsigned)g_project_cfg.doorCount,
        (unsigned long)g_project_cfg.openTimeoutMs,
        (unsigned)g_project_cfg.net.dhcpEnabled,
        (unsigned)g_project_cfg.net.webPort
    );
}

static uint8_t build_journal_stat(jsonw_t *w)
{
    journal_stats_t st;
    (void)memset(&st, 0, sizeof(st));
    EventJournal_GetStats(&st);

    return jw_appendf(w,
        "{"
          "\"base\":%lu,"
          "\"size\":%lu,"
          "\"sectorSize\":%lu,"
          "\"sectors\":%lu,"
          "\"currentSector\":%lu,"
          "\"currentSeq\":%lu,"
          "\"recordsWritten\":%lu,"
          "\"droppedQueue\":%lu,"
          "\"ioErrors\":%lu"
        "}",
        (unsigned long)st.base,
        (unsigned long)st.size,
        (unsigned long)st.sector_size,
        (unsigned long)st.sectors,
        (unsigned long)st.current_sector,
        (unsigned long)st.current_seq,
        (unsigned long)st.records_written,
        (unsigned long)st.dropped_queue,
        (unsigned long)st.io_errors
    );
}

int HttpApi_HandleGet(const char *path, char *out_body, size_t out_sz)
{
    if (!path || !out_body || out_sz == 0U) return 500;

    jsonw_t w;
    jw_init(&w, out_body, out_sz);

    /* Важно: WEB/HTTP только на MASTER. Но HttpTask уже это проверяет.
     * Здесь повторно не проверяем, чтобы не раздувать код.
     */

    if (strcmp(path, "/api/state") == 0)
    {
        return build_state(&w) ? 200 : 500;
    }
    if (strcmp(path, "/api/doors") == 0)
    {
        return build_doors(&w) ? 200 : 500;
    }
    if (strcmp(path, "/api/config") == 0)
    {
        return build_config(&w) ? 200 : 500;
    }
    if (strcmp(path, "/api/journal/stat") == 0)
    {
        return build_journal_stat(&w) ? 200 : 500;
    }

    return 404;
}

/* =========================================================
 * Stage 9.3 (draft): PUT /api/config
 *
 * We deliberately implement a SMALL "merge" JSON payload first.
 * This is enough to debug Ethernet/HTTP + QSPI persist pipeline:
 *   JSON -> merge -> validate -> ConfigService_Persist(A/B) -> journal
 *
 * Supported keys (optional):
 *   - projectName: string
 *   - openTimeoutMs: uint32
 *   - net: { dhcpEnabled: bool, webPort: uint16 }
 *
 * Anything else is ignored for now.
 * ========================================================= */

static int put_config_merge(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    (void)body_len;

    jsonw_t w;
    jw_init(&w, out_body, out_sz);

    if (!body || body[0] == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }

    /* Start from current active config and apply only provided fields. */
    project_config_t cfg = g_project_cfg;

    /* Ensure we keep the correct format version and bump sequence.
     * Seq is used by A/B selection on boot.
     */
    cfg.formatVersion = CFG_FORMAT_VERSION;
    cfg.seq = (uint32_t)(g_project_cfg.seq + 1U);

    /* projectName */
    char pname[CFG_PROJECT_NAME_LEN];
    if (Json_GetString(body, "projectName", pname, sizeof(pname))) {
        /* Safe copy + always 0-terminate */
        memset(cfg.projectName, 0, sizeof(cfg.projectName));
        strncpy(cfg.projectName, pname, sizeof(cfg.projectName) - 1U);
    }

    /* openTimeoutMs */
    uint32_t ot;
    if (Json_GetUint32(body, "openTimeoutMs", &ot)) {
        cfg.openTimeoutMs = ot;
    }

    /* net object (optional) */
    json_span_t net_span;
    if (Json_FindObjectSpan(body, "net", &net_span)) {
        /* Copy to a small temp buffer, so Json_* functions can work on a 0-terminated string. */
        char net_json[256];
        size_t n = net_span.len;
        if (n >= sizeof(net_json)) n = sizeof(net_json) - 1U;
        memcpy(net_json, net_span.ptr, n);
        net_json[n] = 0;

        uint8_t dh;
        if (Json_GetBool(net_json, "dhcpEnabled", &dh)) {
            cfg.net.dhcpEnabled = dh ? 1U : 0U;
        }

        uint16_t wp;
        if (Json_GetUint16(net_json, "webPort", &wp)) {
            cfg.net.webPort = wp;
        }
    }

    /* Validate updated config using Stage 7 rules. */
    cfg_validate_error_t err;
    memset(&err, 0, sizeof(err));
    if (Config_Validate(&cfg, &err) != CFG_VALIDATE_OK) {
        /* Return human-friendly error for the dev UI. */
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"%s\"}", err.text);
        return 400;
    }

    /* Finalize hook (currently noop, but keep it in the pipeline). */
    Config_Finalize(&cfg);

    const cfg_storage_status_t st = ConfigService_Persist(&cfg);
    if (st != CFGST_OK) {
        (void)jw_appendf(&w, "{\"ok\":0,\"persistStatus\":%u}", (unsigned)st);
        return 500;
    }

    /* Persist success: update active RAM copy.
     * Note: runtime re-apply of parameters (timeouts etc.) can be added later
     * via a dedicated service/hook if needed.
     */
    g_project_cfg = cfg;

    (void)jw_appendf(&w, "{\"ok\":1,\"persistStatus\":%u,\"seq\":%lu}",
                     (unsigned)st, (unsigned long)cfg.seq);
    return 200;
}

int HttpApi_HandlePut(const char *path,
                      const char *body, size_t body_len,
                      char *out_body, size_t out_sz)
{
    if (!path || !out_body || out_sz == 0U) return 500;
    if (strcmp(path, "/api/config") == 0) {
        return put_config_merge(body, body_len, out_body, out_sz);
    }
    /* unknown path */
    if (out_body && out_sz) {
        out_body[0] = 0;
    }
    return 404;
}
