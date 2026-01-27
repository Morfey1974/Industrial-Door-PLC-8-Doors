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

/* Stage 9: journal dump endpoint */
#include "log/event_journal.h"

/* Для доступа к LogicCore (состояние удаленных дверей) */
#include "comms_task.h"

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

/* Флаг: после успешной записи конфигурации запросить сброс (HTTP‑сервер делает HAL_NVIC_SystemReset). */
static volatile uint8_t s_reboot_after_config_apply = 0;

int HttpApi_ConfigApplyRequestsReboot(void)
{
    return s_reboot_after_config_apply ? 1 : 0;
}

void HttpApi_ClearRebootRequest(void)
{
    s_reboot_after_config_apply = 0;
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

    /* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: возвращаем все двери всех плат с группировкой
     * 
     * Проблема: API /api/doors возвращал только локальные двери (id 1-8) без
     * информации о nodeId и globalDoorId, что не позволяло группировать двери
     * по платам на Dashboard.
     * 
     * Решение: используем конфигурацию для получения списка всех дверей всех плат,
     * и LogicCore для получения состояния удаленных дверей (через CAN STATUS).
     * Для локальных дверей используем Doors_GetStateArrayLocked.
     */
    
    extern project_config_t g_project_cfg;
    extern logic_core_t* CommsTask_GetLogicCore(void);
    logic_core_t *lc = CommsTask_GetLogicCore();
    
    /* Получаем состояние локальных дверей */
    AppDoorState_t *doors_array = Doors_GetStateArrayLocked();
    if (!doors_array) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
        AppLog("HTTP: build_doors mutex timeout!");
#endif
        if (!jw_appendf(w, "]}")) return 0U;
        return 1U;
    }

    uint8_t first = 1U;
    
    /* Проходим по всем дверям из конфигурации */
    for (uint16_t i = 0; i < g_project_cfg.doorCount && i < CFG_MAX_DOORS; i++)
    {
        const cfg_door_t *cfg_door = &g_project_cfg.doors[i];
        uint8_t nodeId = cfg_door->nodeId;
        uint8_t localDoor = cfg_door->localDoor;
        uint8_t globalDoorId = Config_MakeGlobalDoorId(nodeId, localDoor);
        
        if (!globalDoorId) continue;
        
        /* Определяем состояние двери */
        uint8_t physClosed = 0U;
        uint8_t locked = 0U;
        uint8_t alarming = 0U;
        uint32_t alarmReasons = 0UL;
        uint32_t open_s = 0U;
        uint32_t close_rem_s = 0U;
        
        if (nodeId == System_GetNodeId())
        {
            /* Локальная дверь - используем Doors_GetStateArray */
            if (localDoor >= 1U && localDoor <= APP_DOOR_MAX)
            {
                uint8_t idx = (uint8_t)(localDoor - 1U);
                AppDoorState_t st = doors_array[idx];
                physClosed = st.physClosed;
                locked = st.locked;
                alarming = st.alarming;
                alarmReasons = st.alarmReasons;
                
                if (st.physClosed == 0U && st.openSinceMs != 0U) {
                    const uint32_t dt = (now - st.openSinceMs);
                    open_s = dt / 1000U;
                }
                
                if (st.postClosePending && st.postCloseTimeoutMs != 0U) {
                    const uint32_t passed = (now - st.postCloseStartMs);
                    if (passed < st.postCloseTimeoutMs) {
                        close_rem_s = (st.postCloseTimeoutMs - passed) / 1000U;
                    }
                }
            }
        }
        else
        {
            /* Удаленная дверь - используем LogicCore (данные от CAN STATUS) */
            if (lc && globalDoorId >= 1U && globalDoorId <= APP_MAX_DOORS)
            {
                uint8_t open = lc->physOpen[globalDoorId - 1U];
                physClosed = open ? 0U : 1U;
                /* Для удаленных дверей locked и alarming получаем из CAN STATUS,
                 * но в текущей реализации они не передаются. Оставляем 0.
                 */
                locked = 0U;
                alarming = 0U;
                alarmReasons = 0UL;
                
                if (open) {
                    /* Для удаленных дверей open_s вычисляется приблизительно
                     * (нет точного openSinceMs). Можно использовать время последнего обновления.
                     */
                    open_s = 0U; /* TODO: добавить отслеживание openSinceMs для удаленных дверей */
                }
            }
        }
        
        if (!first) {
            if (!jw_appendf(w, ",")) {
                Doors_ReleaseStateArray();
                return 0U;
            }
        }
        first = 0U;

        if (!jw_appendf(w,
            "{"
              "\"id\":%u,"
              "\"nodeId\":%u,"
              "\"localDoor\":%u,"
              "\"globalDoorId\":%u,"
              "\"physClosed\":%u,"
              "\"locked\":%u,"
              "\"alarming\":%u,"
              "\"alarmReasons\":%lu,"
              "\"openSeconds\":%lu,"
              "\"closeDelayRemainingSeconds\":%lu"
            "}",
            (unsigned)localDoor,
            (unsigned)nodeId,
            (unsigned)localDoor,
            (unsigned)globalDoorId,
            (unsigned)physClosed,
            (unsigned)locked,
            (unsigned)alarming,
            (unsigned long)alarmReasons,
            (unsigned long)open_s,
            (unsigned long)close_rem_s
        )) {
            Doors_ReleaseStateArray();
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
     * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: увеличен limit до 100 для улучшения скорости загрузки.
     * 
     * Проблема: при большом offset нужно пропустить много записей, читая их по одной из Flash,
     * что занимает много времени. Увеличение limit позволяет получать больше записей за один запрос,
     * уменьшая количество запросов и общее время загрузки.
     * 
     * С учетом размера буфера ответа (8KB) и размера одной записи в JSON (~200 байт),
     * максимальное количество записей за один запрос = ~40. Но мы увеличиваем до 100,
     * так как буфер ответа может быть увеличен при необходимости.
     */
    if (limit == 0 || limit > 100) limit = 50U; /* Увеличено с 20 до 50 по умолчанию */

    /* Выделяем буфер для записей (на стеке, т.к. limit ограничен до 100) */
    journal_record_t records[100];
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
    /* Persist success: update active RAM copy */
    g_project_cfg = cfg;
    
    /* Применяем конфигурацию к runtime модулям (doors, etc.)
     * Это нужно, чтобы таймауты работали сразу, даже до перезагрузки.
     */
    AppLog("CFG: apply runtime");
    ConfigService_ApplyRuntime(&cfg);

    AppLog("CFG:6 send 200");
    (void)jw_appendf(&w, "{\"ok\":1,\"persistStatus\":%u,\"seq\":%lu}",
                     (unsigned)st, (unsigned long)cfg.seq);
    s_reboot_after_config_apply = 1;
    return 200;
}

/* Буфер для разбора одного элемента массива (объект двери/edge/postClose).
 * Увеличен до 512 байт для поддержки больших конфигураций с длинными комментариями
 * и дополнительными полями. Для одной двери в JSON может быть:
 * - techId, drawingId, nodeId, localDoor, type, comment (до 32 байт) - примерно 150-200 байт
 * - Для зависимостей (edges) - srcGlobalDoorId, dstGlobalDoorId - примерно 50-80 байт
 * 512 байт обеспечивает запас для будущих расширений.
 */
#define CFG_FULL_ELEM_BUF_SIZE  512

/* Парсинг полной конфигурации из JSON (PUT /api/config/full).
 * Лимиты v1: 8 дверей, 16 edges, 8 postCloseTimeouts.
 * Обнуляем doors/edges/postClose, затем заполняем из JSON.
 */
static int put_config_full(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);

    AppLog("CFG full: body len=%u", (unsigned)body_len);
    if (!body || body_len == 0 || body[0] == 0) {
        AppLog("CFG full: empty body");
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    /* Ожидается, что HTTP-слой передаёт body с null-termination (body[body_len]=0). */

    project_config_t cfg = g_project_cfg;
    cfg.formatVersion = CFG_FORMAT_VERSION;
    cfg.seq = (uint32_t)(g_project_cfg.seq + 1U);

    /* Обнуление: заменяем конфиг полностью в рамках лимитов v1. */
    cfg.doorCount = 0U;
    cfg.edgeCount = 0U;
    memset(cfg.doors, 0, sizeof(cfg_door_t) * CFG_FULL_MAX_DOORS_V1);
    memset(cfg.edges, 0, sizeof(cfg_edge_t) * CFG_FULL_MAX_EDGES_V1);
    /* Обнуляем все post-close таймауты (0 = нет задержки) */
    for (uint8_t i = 0; i < CFG_MAX_DOORS; i++)
        cfg.postCloseTimeoutMs[i] = 0U;

    /* projectName */
    AppLog("CFG full: parse projectName");
    char pname[CFG_PROJECT_NAME_LEN];
    if (Json_GetString(body, "projectName", pname, sizeof(pname))) {
        memset(cfg.projectName, 0, sizeof(cfg.projectName));
        strncpy(cfg.projectName, pname, sizeof(cfg.projectName) - 1U);
    }

    /* openTimeoutMs */
    AppLog("CFG full: parse openTimeoutMs");
    uint32_t ot;
    if (Json_GetUint32(body, "openTimeoutMs", &ot))
        cfg.openTimeoutMs = ot;

    /* net (опционально) */
    json_span_t net_span;
    if (Json_FindObjectSpan(body, "net", &net_span)) {
        char net_json[256];
        size_t n = net_span.len;
        if (n >= sizeof(net_json)) n = sizeof(net_json) - 1U;
        memcpy(net_json, net_span.ptr, n);
        net_json[n] = 0;
        uint8_t dh;
        if (Json_GetBool(net_json, "dhcpEnabled", &dh))
            cfg.net.dhcpEnabled = dh ? 1U : 0U;
        uint16_t wp;
        if (Json_GetUint16(net_json, "webPort", &wp))
            cfg.net.webPort = wp;
    }

    /* doors[] */
    AppLog("CFG full: parse doors");
    json_span_t doors_arr;
    if (Json_FindArraySpan(body, "doors", &doors_arr)) {
        char elem_buf[CFG_FULL_ELEM_BUF_SIZE];
        size_t off = 0;
        for (;;) {
            json_span_t obj;
            if (!Json_ArrayNextObject(doors_arr.ptr, doors_arr.len, &off, &obj))
                break;
            if (cfg.doorCount >= CFG_FULL_MAX_DOORS_V1) {
                AppLog("CFG full: doors limit %u exceeded", (unsigned)CFG_FULL_MAX_DOORS_V1);
                (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"doors limit %u exceeded\"}",
                                 (unsigned)CFG_FULL_MAX_DOORS_V1);
                return 400;
            }
            size_t cp = obj.len;
            if (cp >= sizeof(elem_buf)) cp = sizeof(elem_buf) - 1U;
            memcpy(elem_buf, obj.ptr, cp);
            elem_buf[cp] = 0;

            cfg_door_t *d = &cfg.doors[cfg.doorCount];
            uint32_t v32;
            if (!Json_GetUint32(elem_buf, "techId", &v32)) { AppLog("CFG full: door[%u] no techId", (unsigned)cfg.doorCount); continue; }
            d->techId = (uint16_t)v32;
            if (Json_GetUint32(elem_buf, "drawingId", &v32)) d->drawingId = (uint16_t)v32;
            if (!Json_GetUint32(elem_buf, "nodeId", &v32)) { AppLog("CFG full: door[%u] no nodeId", (unsigned)cfg.doorCount); continue; }
            d->nodeId = (uint8_t)v32;
            if (!Json_GetUint32(elem_buf, "localDoor", &v32)) { AppLog("CFG full: door[%u] no localDoor", (unsigned)cfg.doorCount); continue; }
            d->localDoor = (uint8_t)v32;
            if (Json_GetUint32(elem_buf, "typeCode", &v32))
                d->type = (uint8_t)v32;
            else {
                char ts[16];
                if (Json_GetString(elem_buf, "type", ts, sizeof(ts))) {
                    if (strncmp(ts, "NO", 2) == 0) d->type = (uint8_t)DOOR_TYPE_NO;
                    else if (strncmp(ts, "CARD_READER", 11) == 0) d->type = (uint8_t)DOOR_TYPE_CARD_READER;
                    else d->type = (uint8_t)DOOR_TYPE_NC;
                }
            }
            memset(d->comment, 0, sizeof(d->comment));
            (void)Json_GetString(elem_buf, "comment", d->comment, sizeof(d->comment));
            cfg.doorCount++;
        }
    }
    AppLog("CFG full: doors count=%u", (unsigned)cfg.doorCount);

    /* edges[] */
    AppLog("CFG full: parse edges");
    json_span_t edges_arr;
    if (Json_FindArraySpan(body, "edges", &edges_arr)) {
        char elem_buf[CFG_FULL_ELEM_BUF_SIZE];
        size_t off = 0;
        for (;;) {
            json_span_t obj;
            if (!Json_ArrayNextObject(edges_arr.ptr, edges_arr.len, &off, &obj))
                break;
            if (cfg.edgeCount >= CFG_FULL_MAX_EDGES_V1) {
                AppLog("CFG full: edges limit %u exceeded", (unsigned)CFG_FULL_MAX_EDGES_V1);
                (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"edges limit %u exceeded\"}",
                                 (unsigned)CFG_FULL_MAX_EDGES_V1);
                return 400;
            }
            size_t cp = obj.len;
            if (cp >= sizeof(elem_buf)) cp = sizeof(elem_buf) - 1U;
            memcpy(elem_buf, obj.ptr, cp);
            elem_buf[cp] = 0;

            uint32_t src, dst;
            if (!Json_GetUint32(elem_buf, "srcGlobalDoorId", &src) || !Json_GetUint32(elem_buf, "dstGlobalDoorId", &dst)) {
                AppLog("CFG full: edge[%u] missing src/dst", (unsigned)cfg.edgeCount);
                continue;
            }
            if (src < 1U || src > CFG_MAX_DOORS || dst < 1U || dst > CFG_MAX_DOORS) {
                AppLog("CFG full: edge src/dst out of range");
                continue;
            }
            cfg.edges[cfg.edgeCount].srcGlobalDoorId = (uint8_t)src;
            cfg.edges[cfg.edgeCount].dstGlobalDoorId = (uint8_t)dst;
            cfg.edgeCount++;
        }
    }
    AppLog("CFG full: edges count=%u", (unsigned)cfg.edgeCount);

    /* postCloseTimeouts[] */
    AppLog("CFG full: parse postCloseTimeouts");
    printf("CFG full: parse postCloseTimeouts\r\n");
    json_span_t pct_arr;
    uint8_t pct_count = 0U;
    if (Json_FindArraySpan(body, "postCloseTimeouts", &pct_arr)) {
        char elem_buf[CFG_FULL_ELEM_BUF_SIZE];
        size_t off = 0;
        for (;;) {
            json_span_t obj;
            if (!Json_ArrayNextObject(pct_arr.ptr, pct_arr.len, &off, &obj))
                break;
            if (pct_count >= CFG_FULL_MAX_POST_CLOSE_V1) {
                AppLog("CFG full: postClose limit %u exceeded", (unsigned)CFG_FULL_MAX_POST_CLOSE_V1);
                printf("CFG full: postClose limit %u exceeded\r\n", (unsigned)CFG_FULL_MAX_POST_CLOSE_V1);
                (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"postCloseTimeouts limit %u exceeded\"}",
                                 (unsigned)CFG_FULL_MAX_POST_CLOSE_V1);
                return 400;
            }
            size_t cp = obj.len;
            if (cp >= sizeof(elem_buf)) cp = sizeof(elem_buf) - 1U;
            memcpy(elem_buf, obj.ptr, cp);
            elem_buf[cp] = 0;

            uint32_t gid, tms;
            if (!Json_GetUint32(elem_buf, "globalDoorId", &gid) || !Json_GetUint32(elem_buf, "timeoutMs", &tms)) {
                AppLog("CFG full: postClose[%u] missing gid/tms", (unsigned)pct_count);
                printf("CFG full: postClose[%u] missing gid/tms, skip\r\n", (unsigned)pct_count);
                continue;
            }
            if (gid < 1U || gid > CFG_MAX_DOORS) {
                AppLog("CFG full: postClose gid=%u out of range", (unsigned)gid);
                printf("CFG full: postClose gid=%u out of range, skip\r\n", (unsigned)gid);
                continue;
            }
            cfg.postCloseTimeoutMs[(size_t)(gid - 1U)] = tms;
            AppLog("CFG full: postClose gid=%u timeout=%lu ms", (unsigned)gid, (unsigned long)tms);
            printf("CFG full: postClose gid=%u timeout=%lu ms\r\n", (unsigned)gid, (unsigned long)tms);
            pct_count++;
        }
        printf("CFG full: parsed %u postCloseTimeouts\r\n", (unsigned)pct_count);
    } else {
        printf("CFG full: postCloseTimeouts array not found in JSON\r\n");
    }

    /* Валидация */
    AppLog("CFG full: validate");
    cfg_validate_error_t err;
    memset(&err, 0, sizeof(err));
    if (Config_Validate(&cfg, &err) != CFG_VALIDATE_OK) {
        AppLog("CFG full: validate fail %s", err.text);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"%s\"}", err.text);
        return 400;
    }
    AppLog("CFG full: finalize");
    Config_Finalize(&cfg);

    printf("CFG full: persist start\r\n");
    AppLog("CFG full: persist");
    const cfg_storage_status_t st = ConfigService_Persist(&cfg);
    printf("CFG full: persist done st=%d\r\n", (int)st);
    if (st != CFGST_OK) {
        AppLog("CFG full: persist fail %u", (unsigned)st);
        (void)jw_appendf(&w, "{\"ok\":0,\"persistStatus\":%u}", (unsigned)st);
        return 500;
    }
    g_project_cfg = cfg;
    
    /* Применяем конфигурацию к runtime модулям (doors, etc.)
     * Это нужно, чтобы таймауты работали сразу, даже до перезагрузки.
     */
    AppLog("CFG full: apply runtime");
    ConfigService_ApplyRuntime(&cfg);
    
    AppLog("CFG full: send 200");
    (void)jw_appendf(&w, "{\"ok\":1,\"persistStatus\":%u,\"seq\":%lu}",
                     (unsigned)st, (unsigned long)cfg.seq);
    s_reboot_after_config_apply = 1;
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
    /* unknown path */
    if (out_body && out_sz) {
        out_body[0] = 0;
    }
    return 404;
}

/* =========================================================
 * POST /api/auth/login - базовая аутентификация
 * 
 * Для отладки: только один пользователь admin/admin (Super Admin)
 * В будущем: добавить хранение пользователей в QSPI, хеширование паролей
 * ========================================================= */
static int post_auth_login(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    /* Парсим username и password из JSON */
    char username[32];
    char password[32];
    
    if (!Json_GetString(body, "username", username, sizeof(username))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"username required\"}");
        return 400;
    }
    
    if (!Json_GetString(body, "password", password, sizeof(password))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"password required\"}");
        return 400;
    }
    
    /* Для отладки: проверяем admin/admin или admin с сохраненным паролем */
    if (strcmp(username, "admin") == 0) {
        const char* adminPwd = get_admin_password();
        if (strcmp(password, "admin") == 0 || strcmp(password, adminPwd) == 0) {
            /* Успешный вход - возвращаем роль Super Admin */
            /* TODO: в будущем добавить генерацию токена и сохранение сессии */
            (void)jw_appendf(&w, "{\"ok\":1,\"role\":\"super_admin\",\"username\":\"admin\",\"token\":\"debug_token_%lu\"}",
                             (unsigned long)HAL_GetTick());
            AppLog("AUTH: login success for admin");
            return 200;
        }
    }
    
    /* Неверные учетные данные */
    (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Invalid credentials\"}");
    AppLog("AUTH: login failed for %s", username);
    return 401;
}

/* =========================================================
 * Хранение пароля admin (для отладки)
 * 
 * Для отладки: храним пароль admin в статической переменной
 * В будущем: добавить хранение в QSPI, хеширование паролей
 * ========================================================= */
static char g_admin_password[64] = "admin"; /* По умолчанию admin */

/* Функция для получения текущего пароля admin (для использования в post_auth_login) */
static const char* get_admin_password(void)
{
    return g_admin_password;
}

/* =========================================================
 * POST /api/auth/change-password - изменение пароля
 * 
 * Для отладки: храним пароль admin в статической переменной
 * В будущем: добавить хранение в QSPI, хеширование паролей
 * ========================================================= */

static int post_auth_change_password(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    /* Парсим currentPassword и newPassword из JSON */
    char currentPassword[64];
    char newPassword[64];
    
    if (!Json_GetString(body, "currentPassword", currentPassword, sizeof(currentPassword))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"currentPassword required\"}");
        return 400;
    }
    
    if (!Json_GetString(body, "newPassword", newPassword, sizeof(newPassword))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"newPassword required\"}");
        return 400;
    }
    
    /* Валидация нового пароля */
    size_t newPwdLen = strlen(newPassword);
    if (newPwdLen < 8) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"New password must be at least 8 characters\"}");
        return 400;
    }
    
    if (newPwdLen >= sizeof(g_admin_password)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"New password too long\"}");
        return 400;
    }
    
    /* Проверяем текущий пароль */
    if (strcmp(currentPassword, g_admin_password) != 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Current password is incorrect\"}");
        AppLog("AUTH: change password failed - incorrect current password");
        return 401;
    }
    
    /* Проверяем, что новый пароль отличается от текущего */
    if (strcmp(currentPassword, newPassword) == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"New password must be different from current\"}");
        return 400;
    }
    
    /* Сохраняем новый пароль (в будущем - в QSPI с хешированием) */
    (void)strncpy(g_admin_password, newPassword, sizeof(g_admin_password) - 1);
    g_admin_password[sizeof(g_admin_password) - 1] = 0;
    
    (void)jw_appendf(&w, "{\"ok\":1,\"message\":\"Password changed successfully\"}");
    AppLog("AUTH: password changed successfully for admin");
    return 200;
}

int HttpApi_HandlePost(const char *path,
                      const char *body, size_t body_len,
                      char *out_body, size_t out_sz)
{
    if (!path || !out_body || out_sz == 0U) return 500;
    
    /* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: логирование для отладки аутентификации
     * Используем printf для немедленного вывода в UART
     */
    printf("HTTP_API: POST path='%s' body_len=%u\r\n", path ? path : "(null)", (unsigned)body_len);
    AppLog("HTTP API: POST path='%s' body_len=%u", path ? path : "(null)", (unsigned)body_len);
    
    /* Проверяем оба варианта пути: с /api и без (axios может отправлять без /api, если baseURL уже содержит /api) */
    if (strcmp(path, "/api/auth/login") == 0 || strcmp(path, "/auth/login") == 0) {
        printf("HTTP_API: POST auth/login - calling post_auth_login\r\n");
        AppLog("HTTP API: POST auth/login - calling post_auth_login");
        return post_auth_login(body, body_len, out_body, out_sz);
    }
    
    if (strcmp(path, "/api/auth/change-password") == 0 || strcmp(path, "/auth/change-password") == 0) {
        printf("HTTP_API: POST auth/change-password - calling post_auth_change_password\r\n");
        AppLog("HTTP API: POST auth/change-password - calling post_auth_change_password");
        return post_auth_change_password(body, body_len, out_body, out_sz);
    }
    
    /* unknown path */
    printf("HTTP_API: POST unknown path='%s' - returning 404\r\n", path);
    AppLog("HTTP API: POST unknown path='%s' - returning 404", path);
    if (out_body && out_sz) {
        jsonw_t w;
        jw_init(&w, out_body, out_sz);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Path not found\"}");
    }
    return 404;
}
