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

/* QSPI Flash functions for test write */
#include "qspi_bringup.h"
#include "system/app_qspi_lock.h"
#include "config/config_layout.h"

/* Stage 9: journal dump endpoint */
#include "log/event_journal.h"

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

/* Построение полной конфигурации для Web UI (все двери, зависимости, таймауты) */
static uint8_t build_config_full(jsonw_t *w)
{
    const project_config_t *cfg = &g_project_cfg;
    
    /* Начинаем JSON объект */
    if (!jw_appendf(w, "{")) return 0U;
    
    /* Базовые поля */
    if (!jw_appendf(w,
        "\"formatVersion\":%lu,"
        "\"seq\":%lu,"
        "\"projectName\":\"%s\","
        "\"openTimeoutMs\":%lu,"
        "\"doorCount\":%u,",
        (unsigned long)cfg->formatVersion,
        (unsigned long)cfg->seq,
        cfg->projectName,
        (unsigned long)cfg->openTimeoutMs,
        (unsigned)cfg->doorCount
    )) return 0U;
    
    /* Массив дверей */
    if (!jw_appendf(w, "\"doors\":[")) return 0U;
    for (uint8_t i = 0; i < cfg->doorCount && i < CFG_MAX_DOORS; i++)
    {
        const cfg_door_t *door = &cfg->doors[i];
        if (i != 0) {
            if (!jw_appendf(w, ",")) return 0U;
        }
        
        /* Определяем тип двери как строку */
        const char *type_str = "NC";
        if (door->type == DOOR_TYPE_NO) type_str = "NO";
        else if (door->type == DOOR_TYPE_CARD_READER) type_str = "CARD_READER";
        
        /* Вычисляем globalDoorId */
        uint8_t globalDoorId = Config_MakeGlobalDoorId(door->nodeId, door->localDoor);
        
        if (!jw_appendf(w,
            "{"
              "\"techId\":%u,"
              "\"drawingId\":%u,"
              "\"nodeId\":%u,"
              "\"localDoor\":%u,"
              "\"globalDoorId\":%u,"
              "\"type\":\"%s\","
              "\"typeCode\":%u,"
              "\"comment\":\"%s\""
            "}",
            (unsigned)door->techId,
            (unsigned)door->drawingId,
            (unsigned)door->nodeId,
            (unsigned)door->localDoor,
            (unsigned)globalDoorId,
            type_str,
            (unsigned)door->type,
            door->comment
        )) return 0U;
    }
    if (!jw_appendf(w, "],")) return 0U;
    
    /* Массив зависимостей (edges) */
    if (!jw_appendf(w, "\"edges\":[")) return 0U;
    for (uint16_t i = 0; i < cfg->edgeCount && i < CFG_MAX_EDGES; i++)
    {
        const cfg_edge_t *edge = &cfg->edges[i];
        if (i != 0) {
            if (!jw_appendf(w, ",")) return 0U;
        }
        if (!jw_appendf(w,
            "{\"srcGlobalDoorId\":%u,\"dstGlobalDoorId\":%u}",
            (unsigned)edge->srcGlobalDoorId,
            (unsigned)edge->dstGlobalDoorId
        )) return 0U;
    }
    if (!jw_appendf(w, "],")) return 0U;
    
    /* Массив индивидуальных таймаутов post-close */
    if (!jw_appendf(w, "\"postCloseTimeouts\":[")) return 0U;
    for (uint8_t i = 0; i < cfg->doorCount && i < CFG_MAX_DOORS; i++)
    {
        if (i != 0) {
            if (!jw_appendf(w, ",")) return 0U;
        }
        uint8_t globalDoorId = Config_MakeGlobalDoorId(cfg->doors[i].nodeId, cfg->doors[i].localDoor);
        if (!jw_appendf(w,
            "{\"globalDoorId\":%u,\"timeoutMs\":%lu}",
            (unsigned)globalDoorId,
            (unsigned long)cfg->postCloseTimeoutMs[i]
        )) return 0U;
    }
    if (!jw_appendf(w, "],")) return 0U;
    
    /* Сетевые параметры */
    if (!jw_appendf(w,
        "\"net\":{"
          "\"dhcpEnabled\":%u,"
          "\"webPort\":%u"
        "}",
        (unsigned)cfg->net.dhcpEnabled,
        (unsigned)cfg->net.webPort
    )) return 0U;
    
    /* Закрываем JSON объект */
    if (!jw_appendf(w, "}")) return 0U;
    
    return 1U;
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

/* Простой парсер query параметров: извлекает значение параметра из строки вида "?key=value&key2=value2" */
static uint32_t parse_query_uint32(const char *path, const char *key, uint32_t default_val)
{
    if (!path || !key) return default_val;

    /* Ищем начало query string */
    const char *qmark = strchr(path, '?');
    if (!qmark) return default_val;

    /* Ищем ключ */
    char key_pattern[32];
    snprintf(key_pattern, sizeof(key_pattern), "%s=", key);
    const char *key_pos = strstr(qmark, key_pattern);
    if (!key_pos) return default_val;

    /* Пропускаем "key=" */
    const char *val_start = key_pos + strlen(key_pattern);
    
    /* Читаем число до '&' или конца строки */
    uint32_t val = 0;
    while (*val_start >= '0' && *val_start <= '9')
    {
        val = val * 10U + (uint32_t)(*val_start - '0');
        val_start++;
        if (*val_start == '&' || *val_start == 0) break;
    }

    return val;
}

static uint8_t build_journal_dump(jsonw_t *w, const char *path)
{
    /* Парсим query параметры */
    uint32_t offset = parse_query_uint32(path, "offset", 0U);
    uint32_t limit = parse_query_uint32(path, "limit", 20U);

    /* Ограничиваем limit разумными значениями.
     * С учетом размера буфера (8KB) и размера одной записи (~150 байт),
     * максимальное количество записей за один запрос = ~50.
     */
    if (limit == 0 || limit > 50) limit = 20U;

    /* Выделяем буфер для записей (на стеке, т.к. limit ограничен до 50) */
    journal_record_t records[50];
    uint32_t count = 0;

    journal_status_t status = EventJournal_ReadRecords(offset, limit, records, &count);
    
    if (status != JOURNAL_OK)
    {
        /* В случае ошибки возвращаем пустой массив с информацией об ошибке */
        return jw_appendf(w, "{\"records\":[],\"count\":0,\"offset\":%lu,\"limit\":%lu,\"error\":%u,\"errorMsg\":\"%s\"}",
                         (unsigned long)offset, (unsigned long)limit, (unsigned)status,
                         (status == JOURNAL_NOT_INIT) ? "Journal not initialized" :
                         (status == JOURNAL_IO_ERROR) ? "IO error reading from QSPI" : "Unknown error");
    }
    
    /* Если журнал пустой (count == 0), это нормально, не ошибка */

    if (!jw_appendf(w, "{\"records\":[")) return 0U;

    for (uint32_t i = 0; i < count; i++)
    {
        if (i != 0)
        {
            if (!jw_appendf(w, ",")) return 0U;
        }

        const journal_record_t *r = &records[i];
        
        /* Преобразуем type и source в строки для читаемости */
        const char *type_str = "UNKNOWN";
        switch (r->type)
        {
            case 1: type_str = "DOOR_OPEN"; break;
            case 2: type_str = "DOOR_CLOSE"; break;
            case 3: type_str = "DOOR_ALARM"; break;
            case 4: type_str = "DOOR_OPEN_TIMEOUT"; break;
            case 5: type_str = "DOOR_POST_CLOSE_READY"; break;
            case 6: type_str = "DOOR_SIGNAL_ON"; break;
            case 7: type_str = "DOOR_SIGNAL_OFF"; break;
            case 8: type_str = "CMD_LOCK"; break;
            case 9: type_str = "CMD_UNLOCK"; break;
            case 10: type_str = "NET_LINK_UP"; break;
            case 11: type_str = "NET_LINK_DOWN"; break;
            case 12: type_str = "SYSTEM_FAULT"; break;
        }

        const char *source_str = "UNKNOWN";
        switch (r->source)
        {
            case 0: source_str = "NONE"; break;
            case 1: source_str = "DOOR_LOCAL"; break;
            case 2: source_str = "SUPERVISOR"; break;
            case 3: source_str = "WATCHDOG"; break;
            case 4: source_str = "CAN"; break;
            case 5: source_str = "RS485"; break;
            case 6: source_str = "HTTP"; break;
        }

        if (!jw_appendf(w,
            "{"
              "\"recSeq\":%lu,"
              "\"timestamp\":%lu,"
              "\"type\":\"%s\","
              "\"typeCode\":%u,"
              "\"source\":\"%s\","
              "\"sourceCode\":%u,"
              "\"doorId\":%u,"
              "\"flags\":%u,"
              "\"arg\":%lu"
            "}",
            (unsigned long)r->recSeq,
            (unsigned long)r->timestamp,
            type_str,
            (unsigned)r->type,
            source_str,
            (unsigned)r->source,
            (unsigned)r->door_id,
            (unsigned)r->flags,
            (unsigned long)r->arg
        )) return 0U;
    }

    if (!jw_appendf(w, "],\"count\":%lu,\"offset\":%lu,\"limit\":%lu}",
                   (unsigned long)count, (unsigned long)offset, (unsigned long)limit)) return 0U;

    return 1U;
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
    if (strcmp(path, "/api/config/full") == 0)
    {
        /* Полная конфигурация для Web UI (все двери, зависимости, таймауты) */
        return build_config_full(&w) ? 200 : 500;
    }
    if (strcmp(path, "/api/journal/stat") == 0)
    {
        return build_journal_stat(&w) ? 200 : 500;
    }

    /* /api/journal/dump с поддержкой query параметров offset и limit */
    if (strncmp(path, "/api/journal/dump", 16) == 0)
    {
        return build_journal_dump(&w, path) ? 200 : 500;
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
    AppLog("CFG:1 validate");
    cfg_validate_error_t err;
    memset(&err, 0, sizeof(err));
    if (Config_Validate(&cfg, &err) != CFG_VALIDATE_OK) {
        AppLog("CFG: validate fail %s", err.text);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"%s\"}", err.text);
        return 400;
    }

    AppLog("CFG:2 finalize");
    Config_Finalize(&cfg);
    AppLog("CFG:3 finalize ok");

    /* printf идёт напрямую в UART — виден даже при краше/обрыве логов */
    printf("CFG: persist start\r\n");
    AppLog("CFG:4 persist");
    const cfg_storage_status_t st = ConfigService_Persist(&cfg);
    printf("CFG: persist done st=%d\r\n", (int)st);
    if (st != CFGST_OK) {
        AppLog("CFG: persist fail %u", (unsigned)st);
        (void)jw_appendf(&w, "{\"ok\":0,\"persistStatus\":%u}", (unsigned)st);
        return 500;
    }
    AppLog("CFG:5 persist ok");
    /* Persist success: update active RAM copy.
     * Note: runtime re-apply of parameters (timeouts etc.) can be added later
     * via a dedicated service/hook if needed.
     */
    g_project_cfg = cfg;

    AppLog("CFG:6 send 200");
    (void)jw_appendf(&w, "{\"ok\":1,\"persistStatus\":%u,\"seq\":%lu}",
                     (unsigned)st, (unsigned long)cfg.seq);
    return 200;
}

/* Парсинг полной конфигурации из JSON (для PUT /api/config/full)
 * ВАЖНО: Это упрощенная версия. Полный парсер JSON для массивов дверей и зависимостей
 * требует более сложной реализации. Пока возвращаем ошибку с инструкцией использовать
 * частичное обновление через PUT /api/config.
 */
static int put_config_full(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    (void)body_len;
    
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body[0] == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    /* TODO: Реализовать полный парсер JSON для:
     * - projectName
     * - openTimeoutMs
     * - doors[] (массив дверей)
     * - edges[] (массив зависимостей)
     * - postCloseTimeouts[] (массив таймаутов)
     * - net (сетевые параметры)
     * 
     * Пока используем частичное обновление через put_config_merge
     * для базовых полей.
     */
    
    /* Парсим базовые поля через существующий механизм */
    project_config_t cfg = g_project_cfg;
    cfg.formatVersion = CFG_FORMAT_VERSION;
    cfg.seq = (uint32_t)(g_project_cfg.seq + 1U);
    
    /* projectName */
    char pname[CFG_PROJECT_NAME_LEN];
    if (Json_GetString(body, "projectName", pname, sizeof(pname))) {
        memset(cfg.projectName, 0, sizeof(cfg.projectName));
        strncpy(cfg.projectName, pname, sizeof(cfg.projectName) - 1U);
    }
    
    /* openTimeoutMs */
    uint32_t ot;
    if (Json_GetUint32(body, "openTimeoutMs", &ot)) {
        cfg.openTimeoutMs = ot;
    }
    
    /* TODO: Парсинг массивов doors, edges, postCloseTimeouts
     * Требует реализации парсера JSON массивов в json_simple.c
     */
    
    /* Валидация */
    cfg_validate_error_t err;
    memset(&err, 0, sizeof(err));
    if (Config_Validate(&cfg, &err) != CFG_VALIDATE_OK) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"%s\"}", err.text);
        return 400;
    }
    
    Config_Finalize(&cfg);
    
    const cfg_storage_status_t st = ConfigService_Persist(&cfg);
    if (st != CFGST_OK) {
        (void)jw_appendf(&w, "{\"ok\":0,\"persistStatus\":%u}", (unsigned)st);
        return 500;
    }
    
    g_project_cfg = cfg;
    
    (void)jw_appendf(&w, "{\"ok\":1,\"persistStatus\":%u,\"seq\":%lu,\"warning\":\"Full config parser not implemented. Only basic fields updated.\"}",
                     (unsigned)st, (unsigned long)cfg.seq);
    return 200;
}

/* Тестовая запись 1 байта в Flash для диагностики пути UI -> HTTP -> Flash
 * Использует адрес 0xFEFFFF (последний байт слота A конфигурации)
 * JSON body: {"value": 123} или просто число
 */
static int put_config_test(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    /* Тестовый адрес: последний байт слота A (0xFEFFFF) */
    const uint32_t test_addr = 0xFEFFFFUL;
    uint8_t test_value = 0xAA; /* Значение по умолчанию */
    
    /* Парсим JSON body для получения значения (опционально) */
    if (body && body_len > 0) {
        /* Простой парсинг: ищем "value": число или просто число */
        const char *value_str = strstr(body, "\"value\"");
        if (value_str) {
            const char *colon = strchr(value_str, ':');
            if (colon) {
                int parsed = 0;
                if (sscanf(colon + 1, "%d", &parsed) == 1 && parsed >= 0 && parsed <= 255) {
                    test_value = (uint8_t)parsed;
                }
            }
        } else {
            /* Пробуем распарсить как простое число */
            int parsed = 0;
            if (sscanf(body, "%d", &parsed) == 1 && parsed >= 0 && parsed <= 255) {
                test_value = (uint8_t)parsed;
            }
        }
    }
    
    AppLog("HTTP: PUT /api/config/test - writing 1 byte: value=0x%02X to addr=0x%08lX", 
           (unsigned)test_value, (unsigned long)test_addr);
    
    /* Читаем текущее значение */
    uint8_t old_value = 0xFF;
    AppQspiLock_Lock();
    HAL_StatusTypeDef read_st = QSPI_Flash_Read(test_addr, &old_value, 1);
    AppQspiLock_Unlock();
    
    if (read_st != HAL_OK) {
        AppLog("HTTP: PUT /api/config/test - read failed: HAL status=%d", (int)read_st);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"read failed\",\"halStatus\":%d}", (int)read_st);
        return 500;
    }
    
    AppLog("HTTP: PUT /api/config/test - old value=0x%02X", (unsigned)old_value);
    
    /* Для записи нужно стереть сектор, если значение изменится */
    /* Но для теста мы можем записать в уже стертый сектор или стереть сектор */
    /* Используем адрес, выровненный по сектору */
    const uint32_t sector_addr = (test_addr / QSPI_SECTOR_SIZE) * QSPI_SECTOR_SIZE;
    
    AppLog("HTTP: PUT /api/config/test - erasing sector at 0x%08lX", (unsigned long)sector_addr);
    AppQspiLock_Lock();
    HAL_StatusTypeDef erase_st = QSPI_Flash_Erase4K(sector_addr);
    AppQspiLock_Unlock();
    
    if (erase_st != HAL_OK) {
        AppLog("HTTP: PUT /api/config/test - erase failed: HAL status=%d", (int)erase_st);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"erase failed\",\"halStatus\":%d}", (int)erase_st);
        return 500;
    }
    
    AppLog("HTTP: PUT /api/config/test - erase complete, writing byte");
    
    /* Записываем 1 байт */
    AppQspiLock_Lock();
    HAL_StatusTypeDef write_st = QSPI_Flash_ProgramPage(test_addr, &test_value, 1);
    AppQspiLock_Unlock();
    
    if (write_st != HAL_OK) {
        AppLog("HTTP: PUT /api/config/test - write failed: HAL status=%d", (int)write_st);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"write failed\",\"halStatus\":%d}", (int)write_st);
        return 500;
    }
    
    AppLog("HTTP: PUT /api/config/test - write complete, verifying");
    
    /* Читаем обратно для проверки */
    uint8_t verify_value = 0xFF;
    AppQspiLock_Lock();
    HAL_StatusTypeDef verify_st = QSPI_Flash_Read(test_addr, &verify_value, 1);
    AppQspiLock_Unlock();
    
    if (verify_st != HAL_OK) {
        AppLog("HTTP: PUT /api/config/test - verify read failed: HAL status=%d", (int)verify_st);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"verify read failed\",\"halStatus\":%d}", (int)verify_st);
        return 500;
    }
    
    AppLog("HTTP: PUT /api/config/test - verify value=0x%02X (expected=0x%02X)", 
           (unsigned)verify_value, (unsigned)test_value);
    
    if (verify_value != test_value) {
        AppLog("HTTP: PUT /api/config/test - VERIFY FAILED: written=0x%02X, read=0x%02X",
               (unsigned)test_value, (unsigned)verify_value);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"verify failed\",\"written\":%u,\"read\":%u}",
                         (unsigned)test_value, (unsigned)verify_value);
        return 500;
    }
    
    AppLog("HTTP: PUT /api/config/test - SUCCESS: byte written and verified");
    (void)jw_appendf(&w, "{\"ok\":1,\"address\":\"0x%08lX\",\"oldValue\":%u,\"writtenValue\":%u,\"verifiedValue\":%u}",
                     (unsigned long)test_addr, (unsigned)old_value, (unsigned)test_value, (unsigned)verify_value);
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
    if (strcmp(path, "/api/config/full") == 0) {
        /* Полная конфигурация для Web UI */
        return put_config_full(body, body_len, out_body, out_sz);
    }
    if (strcmp(path, "/api/config/test") == 0) {
        /* Тестовая запись 1 байта в Flash для диагностики */
        return put_config_test(body, body_len, out_body, out_sz);
    }
    /* unknown path */
    if (out_body && out_sz) {
        out_body[0] = 0;
    }
    return 404;
}
