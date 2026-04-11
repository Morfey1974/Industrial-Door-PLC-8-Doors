#include "http_api.h"

#include <stdio.h>
#include <stdarg.h>
#include <string.h>

#include "stm32h7xx_hal.h"
#include "cmsis_os.h"

extern osThreadId_t httpTaskHandle;

#include "app_log.h"
#include "http_server.h"

#include "doors/doors_task.h"
#include "log/event_journal.h"
#include "system_node.h"
#include "net_service.h"
#include "can_task.h"

#include "config/config_format.h"
#include "config/config_layout.h"
#include "config/users_format.h"
#include "config/mapping_storage_qspi.h"
#include "logic/logic_deps.h"
#include "logic/global_door_id.h"
#include "logic/logic_core.h"
#include "qspi_bringup.h"
#include "system/app_qspi_lock.h"

/* Draft JSON merge parser (Stage 9): */
#include "json_simple.h"

/* Экранирование строки для JSON: копирует src в dst, экранирует " и \, ограничивает длину. */
static void json_escape_error(const char *src, char *dst, size_t dst_sz)
{
    if (!dst || dst_sz == 0U) return;
    size_t j = 0U;
    if (dst_sz > 1U && src) {
        for (size_t i = 0; src[i] != '\0' && j < dst_sz - 1U; i++) {
            if ((src[i] == '"' || src[i] == '\\') && j + 2U <= dst_sz - 1U) {
                dst[j++] = '\\';
                dst[j++] = src[i];
            } else {
                dst[j++] = src[i];
            }
        }
    }
    dst[j] = '\0';
}

/* Парсинг IPv4 "a.b.c.d" в uint8_t[4]. Возвращает 1 при успехе. */
static uint8_t parse_ipv4(const char *str, uint8_t *out)
{
    if (!str || !out) return 0U;
    unsigned int a, b, c, d;
    if (sscanf(str, "%u.%u.%u.%u", &a, &b, &c, &d) != 4) return 0U;
    if (a > 255U || b > 255U || c > 255U || d > 255U) return 0U;
    out[0] = (uint8_t)a;
    out[1] = (uint8_t)b;
    out[2] = (uint8_t)c;
    out[3] = (uint8_t)d;
    return 1U;
}

/* Stage 7 service: atomic A/B persist to QSPI + journal event */
#include "config_service.h"

/* Stage 9: journal dump endpoint */
#include "log/event_journal.h"

/* Для доступа к LogicCore (состояние удаленных дверей) */
#include "comms_task.h"

/* Сервис управления пользователями */
#include "users_service.h"
#include "config/users_format.h"
/* RTC: чтение/установка времени для /api/time и журнала событий */
#include "rtc_service.h"

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

/* Флаг: после критичных операций (apply config / clear flash) запросить сброс.
 * HTTP‑сервер выполняет HAL_NVIC_SystemReset после отправки ответа 200. */
static volatile uint8_t s_reboot_requested = 0;

int HttpApi_ConfigApplyRequestsReboot(void)
{
    return s_reboot_requested ? 1 : 0;
}

void HttpApi_ClearRebootRequest(void)
{
    s_reboot_requested = 0;
}

void HttpApi_GetCorsOrigin(char *buf, size_t sz)
{
    if (!buf || sz == 0) return;
    /* Разрешённый origin из конфига: первые 64 байта reserved_u32 (см. config_format.h).
     * При пустой или невалидной строке — "*" (обратная совместимость). */
    const char *o = (const char *)&g_project_cfg.reserved_u32[0];
    if (o[0] == '\0' || (unsigned char)o[0] < 32 || (unsigned char)o[0] > 126) {
        (void)snprintf(buf, sz, "*");
        return;
    }
    size_t n = 0;
    while (n < sz - 1 && n < 64 && o[n] != '\0' && (unsigned char)o[n] >= 32 && (unsigned char)o[n] <= 126)
        { buf[n] = o[n]; n++; }
    buf[n] = '\0';
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

    /* Копируем состояние локальных дверей под мьютексом и сразу отпускаем мьютекс,
     * чтобы не блокировать doors_task на время сборки JSON (иначе логика дверей
     * и зависимостей тормозит при частых запросах /api/doors, например в режиме Просмотр маппинга).
     */
    AppDoorState_t local_doors[APP_DOOR_MAX];
    {
        AppDoorState_t *doors_array = Doors_GetStateArrayLocked();
        if (!doors_array) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
            AppLog("HTTP: build_doors mutex timeout!");
#endif
            if (!jw_appendf(w, "]}")) return 0U;
            return 1U;
        }
        memcpy(local_doors, doors_array, sizeof(local_doors));
        Doors_ReleaseStateArray();
    }

    extern project_config_t g_project_cfg;
    extern logic_core_t* CommsTask_GetLogicCore(void);
    logic_core_t *lc = CommsTask_GetLogicCore();

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
            /* Локальная дверь - используем копию (мьютекс уже отпущен) */
            if (localDoor >= 1U && localDoor <= APP_DOOR_MAX)
            {
                uint8_t idx = (uint8_t)(localDoor - 1U);
                AppDoorState_t st = local_doors[idx];
                physClosed = st.physClosed;
                locked = st.locked;
                /* Чтобы в маппинге (режим просмотра) корректно показывалась блокировка по зависимостям:
                 * если зависимость требует блокировку (lockRequired), показываем locked=1 даже при
                 * возможной задержке применения на железе (например, при опросе с другой платы). */
                if (lc && !locked && globalDoorId >= 1U && globalDoorId <= APP_MAX_DOORS)
                {
                    if (DoorBitset_Test(&lc->lockRequired, globalDoorId))
                        locked = 1U;
                }
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
            /* Удаленная дверь - используем LogicCore (данные от CAN STATUS + lockRequired для карты) */
            if (lc && globalDoorId >= 1U && globalDoorId <= APP_MAX_DOORS)
            {
                const uint8_t idx = (uint8_t)(globalDoorId - 1U);
                uint8_t open = lc->physOpen[idx];
                physClosed = open ? 0U : 1U;
                /* Состояние блокировки по зависимостям — чтобы на карте в режиме просмотра отображалась анимация */
                locked = DoorBitset_Test(&lc->lockRequired, globalDoorId) ? 1U : 0U;
                /* Сигнализация SLAVE приходит масками в STATUS; MASTER сохраняет remoteAlarmReasons в LogicCore */
                alarmReasons = lc->remoteAlarmReasons[idx];
                alarming = (alarmReasons != 0U) ? 1U : 0U;
                if (open) open_s = 0U;
            }
        }

        if (!first) {
            if (!jw_appendf(w, ",")) return 0U;
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
            return 0U;
        }
    }

    uint8_t result = jw_appendf(w, "]}");
    
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
    AppLog("HTTP: build_doors done len=%u result=%u", (unsigned)w->len, (unsigned)result);
#endif

    return result;
}

static uint8_t build_config(jsonw_t *w)
{
    const cfg_net_t *n = &g_project_cfg.net;
    /* net: dhcpEnabled, webPort, ip, netmask, gateway */
    return jw_appendf(w,
        "{"
          "\"formatVersion\":%lu,"
          "\"seq\":%lu,"
          "\"projectName\":\"%s\","
          "\"doorCount\":%u,"
          "\"openTimeoutMs\":%lu,"
          "\"ncUnlockWindowMs\":%lu,"
          "\"ncLockDelayAfterCloseMs\":%lu,"
          "\"net\":{"
            "\"dhcpEnabled\":%u,"
            "\"webPort\":%u,"
            "\"ip\":\"%u.%u.%u.%u\","
            "\"netmask\":\"%u.%u.%u.%u\","
            "\"gateway\":\"%u.%u.%u.%u\""
          "}"
        "}",
        (unsigned long)g_project_cfg.formatVersion,
        (unsigned long)g_project_cfg.seq,
        g_project_cfg.projectName,
        (unsigned)g_project_cfg.doorCount,
        (unsigned long)g_project_cfg.openTimeoutMs,
        (unsigned long)g_project_cfg.ncUnlockWindowMs,
        (unsigned long)g_project_cfg.ncLockDelayAfterCloseMs,
        (unsigned)n->dhcpEnabled,
        (unsigned)n->webPort,
        (unsigned)n->ip[0], (unsigned)n->ip[1], (unsigned)n->ip[2], (unsigned)n->ip[3],
        (unsigned)n->netmask[0], (unsigned)n->netmask[1], (unsigned)n->netmask[2], (unsigned)n->netmask[3],
        (unsigned)n->gw[0], (unsigned)n->gw[1], (unsigned)n->gw[2], (unsigned)n->gw[3]
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
        "\"ncUnlockWindowMs\":%lu,"
        "\"ncLockDelayAfterCloseMs\":%lu,"
        "\"doorCount\":%u,",
        (unsigned long)cfg->formatVersion,
        (unsigned long)cfg->seq,
        cfg->projectName,
        (unsigned long)cfg->openTimeoutMs,
        (unsigned long)cfg->ncUnlockWindowMs,
        (unsigned long)cfg->ncLockDelayAfterCloseMs,
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
        const char *type_str = (door->type == DOOR_TYPE_NO) ? "NO" : "NC";
        
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
    {
        const cfg_net_t *n = &cfg->net;
        if (!jw_appendf(w,
            "\"net\":{"
              "\"dhcpEnabled\":%u,"
              "\"webPort\":%u,"
              "\"ip\":\"%u.%u.%u.%u\","
              "\"netmask\":\"%u.%u.%u.%u\","
              "\"gateway\":\"%u.%u.%u.%u\""
            "}",
            (unsigned)n->dhcpEnabled,
            (unsigned)n->webPort,
            (unsigned)n->ip[0], (unsigned)n->ip[1], (unsigned)n->ip[2], (unsigned)n->ip[3],
            (unsigned)n->netmask[0], (unsigned)n->netmask[1], (unsigned)n->netmask[2], (unsigned)n->netmask[3],
            (unsigned)n->gw[0], (unsigned)n->gw[1], (unsigned)n->gw[2], (unsigned)n->gw[3]
        )) return 0U;
    }
    
    /* Закрываем JSON объект */
    if (!jw_appendf(w, "}")) return 0U;
    
    return 1U;
}

/* Ответ GET /api/time: текущее время контроллера (RTC). unix — секунды с 1970-01-01 для UI. */
static uint8_t build_time_response(jsonw_t *w)
{
    uint32_t unix_sec = 0U;
    if (RTC_GetUnixTime(&unix_sec))
        return jw_appendf(w, "{\"ok\":1,\"unix\":%lu,\"source\":\"rtc\"}", (unsigned long)unix_sec);
    (void)jw_appendf(w, "{\"ok\":0,\"unix\":0,\"source\":\"unavailable\"}");
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
          "\"totalRecords\":%lu,"
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
        (unsigned long)st.total_records,
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

/* Парсер query параметра для строки (оставлен для возможного использования) */
static uint8_t __attribute__((unused)) parse_query_string(const char *path, const char *key, char *out, size_t out_cap)
{
    if (!path || !key || !out || out_cap == 0) return 0U;

    /* Ищем начало query string */
    const char *qmark = strchr(path, '?');
    if (!qmark) return 0U;

    /* Ищем ключ */
    char key_pattern[32];
    snprintf(key_pattern, sizeof(key_pattern), "%s=", key);
    const char *key_pos = strstr(qmark, key_pattern);
    if (!key_pos) return 0U;

    /* Пропускаем "key=" */
    const char *val_start = key_pos + strlen(key_pattern);
    
    /* Читаем строку до '&' или конца строки */
    size_t len = 0;
    while (*val_start && *val_start != '&' && len < out_cap - 1)
    {
        out[len++] = *val_start++;
    }
    out[len] = 0;
    
    return (len > 0) ? 1U : 0U;
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
        
        /* Преобразуем type и source в строки для читаемости; для type 12 (HTTP) arg = действие */
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
            case 12:
                if (r->source == 6) { /* APP_SRC_HTTP: действия пользователя */
                    if (r->arg == 2) type_str = "CONFIG_SAVE";
                    else if (r->arg == 3) type_str = "USER_LOGIN";
                    else if (r->arg == 4) type_str = "USER_LOGOUT";
                    else type_str = "SYSTEM_FAULT";
                } else type_str = "SYSTEM_FAULT";
                break;
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
              "\"arg\":%lu",
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
        /* Добавляем привязку к двери в формате node/local/global, чтобы UI корректно
         * показывал события удалённых плат (например ID-2-1), а не только локальные. */
        if (r->door_id >= 1U && r->door_id <= APP_MAX_DOORS) {
            uint8_t node_id = GlobalDoorId_Node(r->door_id);
            uint8_t local_door = GlobalDoorId_Local(r->door_id);
            if (node_id != 0U && local_door != 0U) {
                if (!jw_appendf(w, ",\"globalDoorId\":%u,\"nodeId\":%u,\"localDoor\":%u",
                                (unsigned)r->door_id,
                                (unsigned)node_id,
                                (unsigned)local_door)) return 0U;
            }
        }
        if (r->username[0] != '\0') {
            char uname_esc[JOURNAL_RECORD_USERNAME_MAX * 2];
            json_escape_error(r->username, uname_esc, sizeof(uname_esc));
            if (!jw_appendf(w, ",\"username\":\"%s\"", uname_esc)) return 0U;
        }
        if (!jw_appendf(w, "}")) return 0U;
    }

    if (!jw_appendf(w, "],\"count\":%lu,\"offset\":%lu,\"limit\":%lu}",
                   (unsigned long)count, (unsigned long)offset, (unsigned long)limit)) return 0U;

    return 1U;
}

/* =========================================================
 * Проверка прав доступа (только Super Admin)
 * ========================================================= */
static uint8_t check_super_admin_access(const char *username)
{
    if (!username)
        return 0U;
    
    user_role_t role = UsersService_GetUserRole(username);
    return (role == USER_ROLE_SUPER_ADMIN) ? 1U : 0U;
}

/* Стереть диапазон QSPI по 4K-секторам.
 * Выполняется в контексте HTTP-задачи; между секторами отдаём CPU, чтобы
 * не «подвешивать» остальные задачи при длительной очистке. */
static uint8_t erase_qspi_region_4k(uint32_t base, uint32_t size)
{
    if ((size == 0U) || ((size % QSPI_SECTOR_SIZE) != 0U))
        return 0U;

    const uint32_t sectors = size / QSPI_SECTOR_SIZE;
    for (uint32_t i = 0U; i < sectors; i++)
    {
        const uint32_t addr = base + i * QSPI_SECTOR_SIZE;
        AppQspiLock_Lock();
        HAL_StatusTypeDef rc = QSPI_Flash_Erase4K(addr);
        AppQspiLock_Unlock();
        if (rc != HAL_OK)
            return 0U;

        if ((i & 0x07U) == 0U)
            osDelay(1U);
    }
    return 1U;
}

/* Детализация данных во flash для UI-сканирования.
 * Биты маски:
 *  - b0: config (slot A/B),
 *  - b1: mapping,
 *  - b2: journal/statistics,
 *  - b3: users db.
 *
 * Важно: users db считаем служебным разделом. Для признака "пользовательские данные"
 * в UI используем только config+mapping+journal. */
static uint8_t local_flash_data_mask_http(void)
{
    uint8_t mask = 0U;
    /* mapping */
    {
        uint8_t hdr[8];
        const uint32_t mapping_magic = 0x4D415050u; /* "MAPP" */
        AppQspiLock_Lock();
        HAL_StatusTypeDef rc = QSPI_Flash_Read(QSPI_MAPPING_BASE, hdr, sizeof(hdr));
        AppQspiLock_Unlock();
        if (rc == HAL_OK) {
            uint32_t magic = (uint32_t)hdr[0] | ((uint32_t)hdr[1] << 8) |
                             ((uint32_t)hdr[2] << 16) | ((uint32_t)hdr[3] << 24);
            uint32_t len = (uint32_t)hdr[4] | ((uint32_t)hdr[5] << 8) |
                           ((uint32_t)hdr[6] << 16) | ((uint32_t)hdr[7] << 24);
            if (magic == mapping_magic && len > 0U && len <= MAPPING_STORAGE_MAX_LEN)
                mask |= (1U << 1); /* mapping */
        }
    }
    /* users */
    {
        uint32_t h[2] = {0U, 0U};
        AppQspiLock_Lock();
        HAL_StatusTypeDef rc = QSPI_Flash_Read(QSPI_USERS_DB_BASE, (uint8_t *)h, sizeof(h));
        AppQspiLock_Unlock();
        if (rc == HAL_OK && h[0] == USERS_DB_MAGIC && h[1] == USERS_FORMAT_VERSION)
            mask |= (1U << 3); /* users db */
    }
    /* config slots */
    {
        uint32_t a = 0U, b = 0U;
        const uint32_t cfg_magic = 0x49444346u; /* IDCF */
        AppQspiLock_Lock();
        HAL_StatusTypeDef rca = QSPI_Flash_Read(QSPI_CFG_SLOT_A_BASE, (uint8_t *)&a, sizeof(a));
        HAL_StatusTypeDef rcb = QSPI_Flash_Read(QSPI_CFG_SLOT_B_BASE, (uint8_t *)&b, sizeof(b));
        AppQspiLock_Unlock();
        if ((rca == HAL_OK && a == cfg_magic) || (rcb == HAL_OK && b == cfg_magic))
            mask |= (1U << 0); /* config */
    }
    /* journal */
    {
        journal_stats_t st;
        memset(&st, 0, sizeof(st));
        EventJournal_GetStats(&st);
        if (st.total_records > 0U)
            mask |= (1U << 2); /* journal */
    }
    return mask;
}

static int post_flash_scan(const char *current_user, char *out_body, size_t out_sz)
{
    if (!check_super_admin_access(current_user))
    {
        (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
        return 403;
    }
    if (System_GetRole() != APP_ROLE_MASTER)
    {
        (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Flash scan allowed only on MASTER\"}");
        return 409;
    }

    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    if (!jw_appendf(&w, "{\"ok\":1,\"boards\":["))
        return 500;

    uint8_t first = 1U;
    for (uint8_t nodeId = 1U; nodeId <= APP_MAX_NODES; nodeId++)
    {
        uint8_t online = (nodeId == 1U) ? 1U : CanTask_MasterIsNodeOnline(nodeId);
        if (!online) continue;

        uint8_t data_mask = 0U;
        uint8_t scan_ok = 1U;
        if (nodeId == 1U)
        {
            data_mask = local_flash_data_mask_http();
        }
        else
        {
            scan_ok = CanTask_MasterFlashScanNode(nodeId, &data_mask);
            if (!scan_ok) data_mask = (uint8_t)((1U << 0) | (1U << 1) | (1U << 2)); /* fail-safe */
        }

        const uint8_t has_user_data = ((data_mask & ((1U << 0) | (1U << 1) | (1U << 2))) != 0U) ? 1U : 0U;

        if (!first && !jw_appendf(&w, ",")) return 500;
        first = 0U;
        if (!jw_appendf(&w,
            "{\"nodeId\":%u,\"online\":1,\"scanOk\":%u,\"hasData\":%u,"
            "\"config\":%u,\"mapping\":%u,\"journal\":%u,\"users\":%u}",
            (unsigned)nodeId,
            (unsigned)(scan_ok ? 1U : 0U),
            (unsigned)has_user_data,
            (unsigned)((data_mask & (1U << 0)) ? 1U : 0U),
            (unsigned)((data_mask & (1U << 1)) ? 1U : 0U),
            (unsigned)((data_mask & (1U << 2)) ? 1U : 0U),
            (unsigned)((data_mask & (1U << 3)) ? 1U : 0U)))
            return 500;
    }
    if (!jw_appendf(&w, "]}")) return 500;
    return 200;
}

static int post_flash_clear_all(const char *body, size_t body_len, const char *current_user, char *out_body, size_t out_sz)
{
    if (!check_super_admin_access(current_user))
    {
        (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
        return 403;
    }
    if (System_GetRole() != APP_ROLE_MASTER)
    {
        (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Flash clear allowed only on MASTER\"}");
        return 409;
    }

    if (!body) body = "";
    uint32_t nodesMask = 0U;
    uint32_t clearService = 0U;
    (void)body_len;
    if (!Json_GetUint32(body, "nodesMask", &nodesMask))
        nodesMask = 1U; /* обратная совместимость: очищаем только MASTER */
    (void)Json_GetUint32(body, "clearService", &clearService);
    if (nodesMask == 0U) {
        (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"nodesMask is empty\"}");
        return 400;
    }

    uint8_t master_ok = 1U;
    uint16_t slave_ok_mask = 0U;
    uint16_t slave_fail_mask = 0U;

    if ((nodesMask & 1U) != 0U)
    {
        journal_status_t jst = EventJournal_EraseAll();
        if (jst != JOURNAL_OK) master_ok = 0U;
        if (master_ok && !erase_qspi_region_4k(QSPI_MAPPING_BASE, QSPI_MAPPING_SIZE)) master_ok = 0U;
        if (master_ok) MappingStorage_SetData(NULL, 0U);
        /* Служебный users db по умолчанию не стираем; отдельный опасный режим — clearService=1. */
        if (master_ok && (clearService != 0U) && !erase_qspi_region_4k(QSPI_USERS_DB_BASE, QSPI_USERS_DB_SIZE)) master_ok = 0U;
        if (master_ok && !erase_qspi_region_4k(QSPI_CFG_SLOT_A_BASE, QSPI_CFG_SLOT_SIZE)) master_ok = 0U;
        if (master_ok && !erase_qspi_region_4k(QSPI_CFG_SLOT_B_BASE, QSPI_CFG_SLOT_SIZE)) master_ok = 0U;
        if (master_ok) {
            Config_Default(&g_project_cfg);
            Config_Finalize(&g_project_cfg);
            ConfigService_ApplyRuntime(&g_project_cfg);
        }
    }

    for (uint8_t nodeId = 2U; nodeId <= APP_MAX_NODES; nodeId++)
    {
        if ((nodesMask & (1UL << (nodeId - 1U))) == 0U) continue;
        if (CanTask_MasterFlashClearNode(nodeId, (clearService != 0U) ? 1U : 0U))
            slave_ok_mask |= (uint16_t)(1U << (nodeId - 1U));
        else
            slave_fail_mask |= (uint16_t)(1U << (nodeId - 1U));
    }

    if (((nodesMask & 1U) && !master_ok) || slave_fail_mask != 0U)
    {
        (void)snprintf(out_body, out_sz,
                       "{\"ok\":0,\"masterOk\":%u,\"slaveOkMask\":%u,\"slaveFailMask\":%u}",
                       (unsigned)(master_ok ? 1U : 0U),
                       (unsigned)slave_ok_mask,
                       (unsigned)slave_fail_mask);
        return 500;
    }

    /* Если очищали мастер — делаем reboot локально. Для удалённых узлов reboot делает сам SLAVE. */
    if ((nodesMask & 1U) != 0U)
        s_reboot_requested = 1U;

    (void)snprintf(out_body, out_sz,
                   "{\"ok\":1,\"reboot\":%u,\"masterOk\":%u,\"slaveOkMask\":%u}",
                   (unsigned)((nodesMask & 1U) ? 1U : 0U),
                   (unsigned)(master_ok ? 1U : 0U),
                   (unsigned)slave_ok_mask);
    return 200;
}

/* =========================================================
 * Извлечение Bearer-токена из заголовков запроса
 * Ищет "Authorization: Bearer <token>" (без учёта регистра)
 * ========================================================= */
static uint8_t get_bearer_token_from_headers(const char *req_buf, int req_len,
                                             char *out_token, size_t token_sz)
{
    if (!req_buf || req_len <= 0 || !out_token || token_sz == 0U)
        return 0U;
    
    const char *p = req_buf;
    const char *end = req_buf + req_len;
    
    while (p < end)
    {
        const char *line_end = p;
        while (line_end < end && *line_end != '\r' && *line_end != '\n')
            line_end++;
        
        if (line_end - p >= 14 &&
            (p[0] == 'A' || p[0] == 'a') &&
            (p[1] == 'U' || p[1] == 'u') &&
            (p[2] == 'T' || p[2] == 't') &&
            (p[3] == 'H' || p[3] == 'h') &&
            (p[4] == 'O' || p[4] == 'o') &&
            (p[5] == 'R' || p[5] == 'r') &&
            (p[6] == 'I' || p[6] == 'i') &&
            (p[7] == 'Z' || p[7] == 'z') &&
            (p[8] == 'A' || p[8] == 'a') &&
            (p[9] == 'T' || p[9] == 't') &&
            (p[10] == 'I' || p[10] == 'i') &&
            (p[11] == 'O' || p[11] == 'o') &&
            (p[12] == 'N' || p[12] == 'n') &&
            (p[13] == ':'))
        {
            p += 14;
            while (p < line_end && (*p == ' ' || *p == '\t'))
                p++;
            if (line_end - p >= 7 &&
                (p[0] == 'B' || p[0] == 'b') &&
                (p[1] == 'E' || p[1] == 'e') &&
                (p[2] == 'A' || p[2] == 'a') &&
                (p[3] == 'R' || p[3] == 'r') &&
                (p[4] == 'E' || p[4] == 'e') &&
                (p[5] == 'R' || p[5] == 'r') &&
                (p[6] == ' '))
            {
                p += 7;
                size_t j = 0U;
                while (p < line_end && *p != ' ' && *p != '\t' && j < token_sz - 1U)
                {
                    out_token[j++] = *p++;
                }
                out_token[j] = '\0';
                return (j > 0U) ? 1U : 0U;
            }
        }
        
        p = line_end;
        while (p < end && (*p == '\r' || *p == '\n'))
            p++;
    }
    return 0U;
}

/* Извлечь X-Client-Time (Unix секунды с ПК) из заголовков. Возвращает 1 при успехе. */
static uint8_t get_client_time_from_headers(const char *headers, int headers_len, uint32_t *out_unix_sec)
{
    if (!headers || headers_len <= 0 || !out_unix_sec) return 0U;
    *out_unix_sec = 0U;
    static const char key[] = "x-client-time:";
    const char *end = headers + headers_len;
    const char *p = headers;
    while (p < end)
    {
        const char *line_end = p;
        while (line_end < end && *line_end != '\r' && *line_end != '\n') line_end++;
        if ((size_t)(line_end - p) >= sizeof(key) - 1U)
        {
            size_t i = 0;
            for (; i < sizeof(key) - 1U; i++)
                if ((char)(p[i] | 0x20) != key[i]) break;
            if (i == sizeof(key) - 1U)
            {
                p += sizeof(key) - 1U;
                while (p < line_end && (*p == ' ' || *p == '\t')) p++;
                uint32_t val = 0U;
                while (p < line_end && *p >= '0' && *p <= '9')
                {
                    val = val * 10U + (uint32_t)(*p - '0');
                    p++;
                }
                *out_unix_sec = val;
                return 1U;
            }
        }
        p = line_end;
        while (p < end && (*p == '\r' || *p == '\n')) p++;
    }
    return 0U;
}

/* Проверка токена; при невалидном пишет JSON в out_body и возвращает 401 */
static int require_auth(const char *req_buf, int req_len,
                        char *out_body, size_t out_sz,
                        char *out_username, size_t username_sz)
{
    char token[64];
    if (!get_bearer_token_from_headers(req_buf, req_len, token, sizeof(token)))
    {
        if (out_body && out_sz > 0U)
            (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Unauthorized\"}");
#if HTTP_DEBUG_ENABLED
        AppLog("AUTH: request without valid Bearer token");
#endif
        return 401;
    }
    if (!UsersService_SessionValidate(token, out_username, username_sz))
    {
        if (out_body && out_sz > 0U)
            (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Unauthorized\"}");
#if HTTP_DEBUG_ENABLED
        AppLog("AUTH: invalid or expired token");
#endif
        return 401;
    }
    return 200;
}

/* Forward declaration для put_users_update */
static int put_users_update(const char *username_param, const char *body, size_t body_len,
                            const char *current_user, char *out_body, size_t out_sz);

/* =========================================================
 * GET /api/users - список пользователей
 * Только для Super Admin
 * ========================================================= */
static uint8_t build_users_list(jsonw_t *w)
{
    user_record_t users[USERS_MAX_COUNT];
    uint32_t count = 0;
    
    if (!UsersService_GetAllUsers(users, USERS_MAX_COUNT, &count))
    {
        (void)jw_appendf(w, "{\"ok\":0,\"error\":\"Failed to get users\"}");
        return 0U;
    }
    
    if (!jw_appendf(w, "{\"ok\":1,\"users\":[")) return 0U;
    
    for (uint32_t i = 0; i < count; i++)
    {
        const char *role_str = "operator";
        if (users[i].role == USER_ROLE_SUPER_ADMIN)
            role_str = "super_admin";
        else if (users[i].role == USER_ROLE_ADMIN)
            role_str = "admin";
        else if (users[i].role == USER_ROLE_OPERATOR)
            role_str = "operator";
        
        if (i > 0 && !jw_appendf(w, ",")) return 0U;
        
        if (!jw_appendf(w,
            "{"
              "\"username\":\"%s\","
              "\"role\":\"%s\","
              "\"enabled\":%u,"
              "\"createdAt\":%lu,"
              "\"lastLogin\":%lu"
            "}",
            users[i].username,
            role_str,
            (unsigned)users[i].enabled,
            (unsigned long)users[i].createdAt,
            (unsigned long)users[i].lastLogin
        )) return 0U;
    }
    
    if (!jw_appendf(w, "],\"count\":%lu}", (unsigned long)count)) return 0U;
    
    return 1U;
}

/* =========================================================
 * Карта маппинга (редактор схемы): GET/PUT /api/config/mapping
 * Хранится в QSPI Flash (сектор 4 КБ); в RAM — копия для быстрого GET.
 * Формат: { "version": 1, "projectName": "", "viewport": { "x", "y", "zoom" }, "objects": [] }
 * ========================================================= */

static uint8_t build_mapping(jsonw_t *w)
{
    if (!w || !w->buf || w->cap == 0U) return 0U;
    /* При первом GET загружаем из QSPI, если в RAM ещё пусто */
    if (MappingStorage_GetLen() == 0U)
        MappingStorage_LoadFromQspi();
    size_t len = MappingStorage_GetLen();
    const char *data = MappingStorage_GetData();
    if (len > 0U && data && (len + 1U) <= w->cap) {
        memcpy(w->buf, data, len + 1U);
        w->len = len;
        return 1U;
    }
    if (len == 0U) {
        return jw_appendf(w, "{\"version\":1,\"projectName\":\"\",\"viewport\":{\"x\":0,\"y\":0,\"zoom\":1},\"objects\":[]}") ? 1U : 0U;
    }
    return 0U;
}

static int put_mapping(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    if (!out_body || out_sz == 0U) return 500;
    if (!body) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    /* Не обрезаем карту: при превышении лимита возвращаем ошибку, иначе после загрузки карта будет пустой (обрезанный JSON невалиден) */
    if (body_len > MAPPING_STORAGE_MAX_LEN) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"map too large (max %u bytes)\",\"max\":%u}",
            (unsigned)MAPPING_STORAGE_MAX_LEN, (unsigned)MAPPING_STORAGE_MAX_LEN);
        return 413;
    }
    MappingStorage_SetData(body, body_len);
    {
        osPriority_t prev_prio = osThreadGetPriority(httpTaskHandle);
        (void)osThreadSetPriority(httpTaskHandle, osPriorityAboveNormal);
        int qspi_ok = (MappingStorage_SaveToQspi() == 0);
        (void)osThreadSetPriority(httpTaskHandle, prev_prio);
        if (!qspi_ok) {
            (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"QSPI write failed\"}");
            return 500;
        }
    }
    (void)jw_appendf(&w, "{\"ok\":1}");
    return 200;
}

int HttpApi_HandleGet(const char *path, const char *request_buf, int request_len,
                      char *out_body, size_t out_sz)
{
    if (!path || !out_body || out_sz == 0U) return 500;

    jsonw_t w;
    jw_init(&w, out_body, out_sz);

    /* Публичные GET без токена: только корень "/" (health check) */
    if (strcmp(path, "/") == 0)
    {
        /* Обрабатывается в http_server.c — здесь не вызываем */
        return 404;
    }

    /* GET /api/auth/session — проверка сессии по токену, возврат данных пользователя */
    if (strcmp(path, "/api/auth/session") == 0)
    {
        char username[32];
        int auth_code = require_auth(request_buf, request_len, out_body, out_sz, username, sizeof(username));
        if (auth_code != 200)
            return 401;
        user_role_t role = UsersService_GetUserRole(username);
        const char *role_str = (role == USER_ROLE_SUPER_ADMIN) ? "super_admin" :
                               (role == USER_ROLE_ADMIN) ? "admin" : "operator";
        (void)jw_appendf(&w, "{\"ok\":1,\"user\":{\"username\":\"%s\",\"role\":\"%s\"}}", username, role_str);
        return 200;
    }

    /* Все остальные GET к маршрутам /api требуют валидный токен */
    char current_user[32];
    int auth_code = require_auth(request_buf, request_len, out_body, out_sz, current_user, sizeof(current_user));
    if (auth_code != 200)
        return 401;

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
        return build_config_full(&w) ? 200 : 500;
    }
    if (strcmp(path, "/api/config/mapping") == 0)
    {
        return build_mapping(&w) ? 200 : 500;
    }
    if (strcmp(path, "/api/journal/stat") == 0)
    {
        return build_journal_stat(&w) ? 200 : 500;
    }
    if (strcmp(path, "/api/time") == 0)
    {
        return build_time_response(&w) ? 200 : 500;
    }

    if (strncmp(path, "/api/journal/dump", 16) == 0)
    {
        return build_journal_dump(&w, path) ? 200 : 500;
    }

    /* GET /api/users — только Super Admin (current_user уже из токена) */
    if (strcmp(path, "/api/users") == 0 || strncmp(path, "/api/users?", 11) == 0)
    {
        if (!check_super_admin_access(current_user))
        {
            (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
            return 403;
        }
        return build_users_list(&w) ? 200 : 500;
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
 *   - net: { dhcpEnabled: bool, webPort: uint16, ip?: string, netmask?: string, gateway?: string }
 *
 * Anything else is ignored for now.
 * ========================================================= */

static int put_config_merge(const char *body, size_t body_len, char *out_body, size_t out_sz,
                            const char *current_user, uint32_t client_unix_sec)
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

    /* NC: окно разблокировки и задержка блокировки после закрытия */
    uint32_t ncWin;
    if (Json_GetUint32(body, "ncUnlockWindowMs", &ncWin)) {
        cfg.ncUnlockWindowMs = ncWin;
    }
    uint32_t ncDelay;
    if (Json_GetUint32(body, "ncLockDelayAfterCloseMs", &ncDelay)) {
        cfg.ncLockDelayAfterCloseMs = ncDelay;
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

        char ip_str[20];
        if (Json_GetString(net_json, "ip", ip_str, sizeof(ip_str)) && parse_ipv4(ip_str, cfg.net.ip)) {
            /* ip updated */
        }
        if (Json_GetString(net_json, "netmask", ip_str, sizeof(ip_str)) && parse_ipv4(ip_str, cfg.net.netmask)) {
            /* netmask updated */
        }
        if (Json_GetString(net_json, "gateway", ip_str, sizeof(ip_str)) && parse_ipv4(ip_str, cfg.net.gw)) {
            /* gateway updated */
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

    AppLog("CFG:4 persist");
    cfg_storage_status_t st;
    {
        osPriority_t prev_prio = osThreadGetPriority(httpTaskHandle);
        (void)osThreadSetPriority(httpTaskHandle, osPriorityAboveNormal);
        st = ConfigService_Persist(&cfg, current_user, client_unix_sec);
        (void)osThreadSetPriority(httpTaskHandle, prev_prio);
    }
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
    s_reboot_requested = 1;
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

/* Статический буфер для разбора PUT /api/config/full (project_config_t ~6KB — не на стеке HTTP-задачи). */
static project_config_t s_put_cfg;

/* Парсинг полной конфигурации из JSON (PUT /api/config/full).
 * Лимиты v1: до 40 дверей, 64 рёбер, 32 postClose.
 * Обнуляем doors/edges/postClose, затем заполняем из JSON.
 */
static int put_config_full(const char *body, size_t body_len, char *out_body, size_t out_sz,
                           const char *current_user, uint32_t client_unix_sec)
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

    project_config_t *cfg = &s_put_cfg;
    *cfg = g_project_cfg;
    cfg->formatVersion = CFG_FORMAT_VERSION;
    cfg->seq = (uint32_t)(g_project_cfg.seq + 1U);

    /* Обнуление: заменяем конфиг полностью в рамках лимитов v1. */
    cfg->doorCount = 0U;
    cfg->edgeCount = 0U;
    memset(cfg->doors, 0, sizeof(cfg_door_t) * CFG_FULL_MAX_DOORS_V1);
    memset(cfg->edges, 0, sizeof(cfg_edge_t) * CFG_FULL_MAX_EDGES_V1);
    /* Обнуляем все post-close таймауты (0 = нет задержки) */
    for (uint8_t i = 0; i < CFG_MAX_DOORS; i++)
        cfg->postCloseTimeoutMs[i] = 0U;

    /* projectName */
    AppLog("CFG full: parse projectName");
    char pname[CFG_PROJECT_NAME_LEN];
    if (Json_GetString(body, "projectName", pname, sizeof(pname))) {
        memset(cfg->projectName, 0, sizeof(cfg->projectName));
        strncpy(cfg->projectName, pname, sizeof(cfg->projectName) - 1U);
    }

    /* openTimeoutMs */
    AppLog("CFG full: parse openTimeoutMs");
    uint32_t ot;
    if (Json_GetUint32(body, "openTimeoutMs", &ot))
        cfg->openTimeoutMs = ot;

    /* NC: окно разблокировки и задержка блокировки после закрытия (по умолчанию 5000 и 1000) */
    uint32_t ncWin;
    if (Json_GetUint32(body, "ncUnlockWindowMs", &ncWin))
        cfg->ncUnlockWindowMs = ncWin;
    else
        cfg->ncUnlockWindowMs = 5000U;
    uint32_t ncDelay;
    if (Json_GetUint32(body, "ncLockDelayAfterCloseMs", &ncDelay))
        cfg->ncLockDelayAfterCloseMs = ncDelay;
    else
        cfg->ncLockDelayAfterCloseMs = 1000U;

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
            cfg->net.dhcpEnabled = dh ? 1U : 0U;
        uint16_t wp;
        if (Json_GetUint16(net_json, "webPort", &wp))
            cfg->net.webPort = wp;
        char ip_str[20];
        if (Json_GetString(net_json, "ip", ip_str, sizeof(ip_str)) && parse_ipv4(ip_str, cfg->net.ip)) { /* ok */ }
        if (Json_GetString(net_json, "netmask", ip_str, sizeof(ip_str)) && parse_ipv4(ip_str, cfg->net.netmask)) { /* ok */ }
        if (Json_GetString(net_json, "gateway", ip_str, sizeof(ip_str)) && parse_ipv4(ip_str, cfg->net.gw)) { /* ok */ }
    }

    /* doors[] — обязателен; иначе после обнуления получится пустой конфиг в Flash */
    AppLog("CFG full: parse doors");
    json_span_t doors_arr;
    if (!Json_FindArraySpan(body, "doors", &doors_arr)) {
        AppLog("CFG full: missing doors array");
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"missing doors array\"}");
        return 400;
    }
    {
        char elem_buf[CFG_FULL_ELEM_BUF_SIZE];
        size_t off = 0;
        for (;;) {
            json_span_t obj;
            if (!Json_ArrayNextObject(doors_arr.ptr, doors_arr.len, &off, &obj))
                break;
            if (cfg->doorCount >= CFG_FULL_MAX_DOORS_V1) {
                AppLog("CFG full: doors limit %u exceeded", (unsigned)CFG_FULL_MAX_DOORS_V1);
                (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"doors limit %u exceeded\"}",
                                 (unsigned)CFG_FULL_MAX_DOORS_V1);
                return 400;
            }
            size_t cp = obj.len;
            if (cp >= sizeof(elem_buf)) cp = sizeof(elem_buf) - 1U;
            memcpy(elem_buf, obj.ptr, cp);
            elem_buf[cp] = 0;

            cfg_door_t *d = &cfg->doors[cfg->doorCount];
            uint32_t v32;
            if (!Json_GetUint32(elem_buf, "techId", &v32)) { AppLog("CFG full: door[%u] no techId", (unsigned)cfg->doorCount); continue; }
            d->techId = (uint16_t)v32;
            if (Json_GetUint32(elem_buf, "drawingId", &v32)) d->drawingId = (uint16_t)v32;
            if (!Json_GetUint32(elem_buf, "nodeId", &v32)) { AppLog("CFG full: door[%u] no nodeId", (unsigned)cfg->doorCount); continue; }
            d->nodeId = (uint8_t)v32;
            if (!Json_GetUint32(elem_buf, "localDoor", &v32)) { AppLog("CFG full: door[%u] no localDoor", (unsigned)cfg->doorCount); continue; }
            d->localDoor = (uint8_t)v32;
            if (Json_GetUint32(elem_buf, "typeCode", &v32))
                d->type = (uint8_t)v32;
            else {
                char ts[16];
                if (Json_GetString(elem_buf, "type", ts, sizeof(ts))) {
                    d->type = (strncmp(ts, "NO", 2) == 0) ? (uint8_t)DOOR_TYPE_NO : (uint8_t)DOOR_TYPE_NC;
                }
            }
            memset(d->comment, 0, sizeof(d->comment));
            (void)Json_GetString(elem_buf, "comment", d->comment, sizeof(d->comment));
            cfg->doorCount++;
        }
    }
    if (cfg->doorCount == 0U) {
        AppLog("CFG full: no valid doors parsed (check techId/nodeId/localDoor)");
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"no valid doors parsed\"}");
        return 400;
    }
    AppLog("CFG full: doors count=%u", (unsigned)cfg->doorCount);

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
            if (cfg->edgeCount >= CFG_FULL_MAX_EDGES_V1) {
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
                AppLog("CFG full: edge[%u] missing src/dst", (unsigned)cfg->edgeCount);
                continue;
            }
            if (src < 1U || src > CFG_MAX_DOORS || dst < 1U || dst > CFG_MAX_DOORS) {
                AppLog("CFG full: edge src/dst out of range");
                continue;
            }
            cfg->edges[cfg->edgeCount].srcGlobalDoorId = (uint8_t)src;
            cfg->edges[cfg->edgeCount].dstGlobalDoorId = (uint8_t)dst;
            cfg->edgeCount++;
        }
    }
    AppLog("CFG full: edges count=%u", (unsigned)cfg->edgeCount);

    /* postCloseTimeouts[] */
    AppLog("CFG full: parse postCloseTimeouts");
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
                continue;
            }
            if (gid < 1U || gid > CFG_MAX_DOORS) {
                AppLog("CFG full: postClose gid=%u out of range", (unsigned)gid);
                continue;
            }
            cfg->postCloseTimeoutMs[(size_t)(gid - 1U)] = tms;
            AppLog("CFG full: postClose gid=%u timeout=%lu ms", (unsigned)gid, (unsigned long)tms);
            pct_count++;
        }
    } else {
    }

    /* Валидация */
    AppLog("CFG full: validate");
    cfg_validate_error_t err;
    memset(&err, 0, sizeof(err));
    if (Config_Validate(cfg, &err) != CFG_VALIDATE_OK) {
        AppLog("CFG full: validate fail %s", err.text);
        /* Экранируем текст ошибки для JSON, чтобы ответ всегда был валидным */
        char err_esc[96];
        json_escape_error(err.text, err_esc, sizeof(err_esc));
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"%s\"}", err_esc);
        return 400;
    }
    AppLog("CFG full: finalize");
    Config_Finalize(cfg);

    AppLog("CFG full: persist");
    cfg_storage_status_t st;
    {
        osPriority_t prev_prio = osThreadGetPriority(httpTaskHandle);
        (void)osThreadSetPriority(httpTaskHandle, osPriorityAboveNormal);
        st = ConfigService_Persist(cfg, current_user, client_unix_sec);
        (void)osThreadSetPriority(httpTaskHandle, prev_prio);
    }
    if (st != CFGST_OK) {
        AppLog("CFG full: persist fail %u", (unsigned)st);
        (void)jw_appendf(&w, "{\"ok\":0,\"persistStatus\":%u}", (unsigned)st);
        return 500;
    }
    g_project_cfg = *cfg;
    
    /* Применяем конфигурацию к runtime модулям (doors, etc.)
     * Это нужно, чтобы таймауты работали сразу, даже до перезагрузки.
     */
    AppLog("CFG full: apply runtime");
    ConfigService_ApplyRuntime(cfg);
    
    AppLog("CFG full: send 200");
    (void)jw_appendf(&w, "{\"ok\":1,\"persistStatus\":%u,\"seq\":%lu}",
                     (unsigned)st, (unsigned long)cfg->seq);
    s_reboot_requested = 1;
    return 200;
}

int HttpApi_HandlePut(const char *path,
                      const char *body, size_t body_len,
                      const char *headers, int headers_len,
                      char *out_body, size_t out_sz)
{
    if (!path || !out_body || out_sz == 0U) return 500;

    /* Все PUT требуют валидный токен */
    char current_user[32];
    int auth_code = require_auth(headers, headers_len, out_body, out_sz, current_user, sizeof(current_user));
    if (auth_code != 200)
        return 401;

    uint32_t client_ts = 0U;
    (void)get_client_time_from_headers(headers, headers_len, &client_ts);
    if (strcmp(path, "/api/config") == 0) {
        return put_config_merge(body, body_len, out_body, out_sz, current_user, client_ts);
    }
    if (strcmp(path, "/api/config/full") == 0) {
        return put_config_full(body, body_len, out_body, out_sz, current_user, client_ts);
    }
    if (strcmp(path, "/api/config/mapping") == 0) {
        return put_mapping(body, body_len, out_body, out_sz);
    }
    
    if (strncmp(path, "/api/users/", 11) == 0) {
        return put_users_update(path + 11, body, body_len, current_user, out_body, out_sz);
    }
    
    if (out_body && out_sz) {
        out_body[0] = 0;
    }
    return 404;
}

/* Rate limit логина: по username, 5 попыток за 15 минут (в RAM). */
#define LOGIN_RATE_WINDOW_MS    (15U * 60U * 1000U)
#define LOGIN_RATE_MAX_ATTEMPTS 5U
#define LOGIN_RATE_SLOTS       20U
#define LOGIN_RATE_DELAY_MS     3000U

typedef struct {
    char username[32];
    uint32_t at;
} login_fail_t;

static login_fail_t s_login_fails[LOGIN_RATE_SLOTS];
static uint32_t s_login_fail_count = 0U;

/* Проверка «не старше 15 минут» с учётом переполнения HAL_GetTick() (~49 дней) */
static uint8_t login_fail_is_recent(uint32_t at, uint32_t now)
{
    return ((uint32_t)(now - at) <= LOGIN_RATE_WINDOW_MS) ? 1U : 0U;
}

static uint32_t login_fail_count_recent(const char *username)
{
    uint32_t now = HAL_GetTick();
    uint32_t n = 0;
    for (uint32_t i = 0; i < s_login_fail_count; i++) {
        if (login_fail_is_recent(s_login_fails[i].at, now) && strcmp(s_login_fails[i].username, username) == 0)
            n++;
    }
    return n;
}

static void login_fail_add(const char *username)
{
    uint32_t now = HAL_GetTick();
    /* Удаляем устаревшие (с учётом переполнения tick) */
    uint32_t j = 0;
    for (uint32_t i = 0; i < s_login_fail_count; i++) {
        if (login_fail_is_recent(s_login_fails[i].at, now)) {
            if (j != i) s_login_fails[j] = s_login_fails[i];
            j++;
        }
    }
    s_login_fail_count = j;
    if (s_login_fail_count >= LOGIN_RATE_SLOTS) {
        /* Вытесняем самый старый */
        s_login_fail_count--;
        for (uint32_t i = 0; i < s_login_fail_count; i++)
            s_login_fails[i] = s_login_fails[i + 1];
    }
    (void)strncpy(s_login_fails[s_login_fail_count].username, username, sizeof(s_login_fails[0].username) - 1);
    s_login_fails[s_login_fail_count].username[sizeof(s_login_fails[0].username) - 1] = '\0';
    s_login_fails[s_login_fail_count].at = now;
    s_login_fail_count++;
}

/* =========================================================
 * POST /api/auth/login - базовая аутентификация
 * ========================================================= */
static int post_auth_login(const char *body, size_t body_len, char *out_body, size_t out_sz,
                           const char *headers, int headers_len)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);

    /* Единое сообщение при любой ошибке входа (не раскрываем, логин или пароль) */
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Неверные учётные данные\",\"remainingAttempts\":%lu}",
                         (unsigned long)LOGIN_RATE_MAX_ATTEMPTS);
        return 401;
    }

    char username[32];
    char password[32];

    if (!Json_GetString(body, "username", username, sizeof(username))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Неверные учётные данные\",\"remainingAttempts\":%lu}",
                         (unsigned long)LOGIN_RATE_MAX_ATTEMPTS);
        return 401;
    }

    if (!Json_GetString(body, "password", password, sizeof(password))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Неверные учётные данные\",\"remainingAttempts\":%lu}",
                         (unsigned long)LOGIN_RATE_MAX_ATTEMPTS);
        return 401;
    }

    /* Ограничение перебора: 5 неудачных попыток по username за 15 минут */
    if (login_fail_count_recent(username) >= LOGIN_RATE_MAX_ATTEMPTS) {
        HAL_Delay(LOGIN_RATE_DELAY_MS);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Неверные учётные данные\",\"remainingAttempts\":0}");
        return 429;
    }

    /* Проверяем учетные данные через UsersService */
    if (UsersService_VerifyPassword(username, password))
    {
        user_role_t role = UsersService_GetUserRole(username);
        const char *role_str = "operator";
        
        if (role == USER_ROLE_SUPER_ADMIN)
            role_str = "super_admin";
        else if (role == USER_ROLE_ADMIN)
            role_str = "admin";
        else if (role == USER_ROLE_OPERATOR)
            role_str = "operator";
        
        /* Обновляем время последнего входа */
        UsersService_UpdateLastLogin(username);
        
        /* Создаём сессию и возвращаем токен для последующих запросов */
        char session_token[64];
        if (UsersService_SessionCreate(username, session_token, sizeof(session_token)))
        {
            (void)jw_appendf(&w, "{\"ok\":1,\"role\":\"%s\",\"username\":\"%s\",\"token\":\"%s\"}",
                             role_str, username, session_token);
        }
        else
        {
            (void)jw_appendf(&w, "{\"ok\":1,\"role\":\"%s\",\"username\":\"%s\",\"token\":\"debug_token_%lu\"}",
                             role_str, username, (unsigned long)HAL_GetTick());
        }
#if HTTP_DEBUG_ENABLED
        AppLog("AUTH: login success for %s (role=%s)", username, role_str);
#endif
        /* Журнал: вход пользователя с временем с ПК */
        {
            uint32_t client_ts = 0U;
            if (get_client_time_from_headers(headers, headers_len, &client_ts))
                EventJournal_LogUserAction(3 /*USER_LOGIN*/, username, client_ts, 1);
        }
        return 200;
    }
    
    /* Неверные учётные данные: единое сообщение + сколько попыток осталось */
    login_fail_add(username);
    {
        uint32_t count = login_fail_count_recent(username);
        uint32_t remaining = (count >= LOGIN_RATE_MAX_ATTEMPTS) ? 0U : (LOGIN_RATE_MAX_ATTEMPTS - count);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Неверные учётные данные\",\"remainingAttempts\":%lu}",
                         (unsigned long)remaining);
    }
#if HTTP_DEBUG_ENABLED
    AppLog("AUTH: login failed for %s", username);
#endif
    return 401;
}

/* =========================================================
 * POST /api/auth/change-password - изменение пароля
 * current_user из токена (вызывающий должен быть залогинен)
 * ========================================================= */
static int post_auth_change_password(const char *body, size_t body_len, const char *current_user,
                                     char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    char username[32];
    char currentPassword[64];
    char newPassword[64];
    
    if (!Json_GetString(body, "username", username, sizeof(username))) {
        (void)strncpy(username, current_user ? current_user : "", sizeof(username) - 1);
        username[sizeof(username) - 1] = 0;
    }
    /* Менять пароль можно только себе, если не Super Admin */
    if (strcmp(username, current_user) != 0 && !check_super_admin_access(current_user)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Access denied\"}");
        return 403;
    }
    
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
    
    if (newPwdLen > 64) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"New password too long\"}");
        return 400;
    }
    
    /* Проверяем текущий пароль */
    if (!UsersService_VerifyPassword(username, currentPassword)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Current password is incorrect\"}");
#if HTTP_DEBUG_ENABLED
        AppLog("AUTH: change password failed - incorrect current password for %s", username);
#endif
        return 401;
    }
    
    /* Проверяем, что новый пароль отличается от текущего */
    if (strcmp(currentPassword, newPassword) == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"New password must be different from current\"}");
        return 400;
    }
    
    /* Обновляем пароль через UsersService */
    user_role_t role = UsersService_GetUserRole(username);
    if (!UsersService_UpdateUser(username, newPassword, role, 1U)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Failed to update password\"}");
#if HTTP_DEBUG_ENABLED
        AppLog("AUTH: change password failed - update error for %s", username);
#endif
        return 500;
    }

    (void)jw_appendf(&w, "{\"ok\":1,\"message\":\"Password changed successfully\"}");
#if HTTP_DEBUG_ENABLED
    AppLog("AUTH: password changed successfully for %s", username);
#endif
    return 200;
}

/* =========================================================
 * POST /api/auth/forgot-password - запрос токена восстановления пароля
 * Только для Super Admin (для генерации токена)
 * ========================================================= */
static int post_auth_forgot_password(const char *body, size_t body_len, const char *current_user,
                                     char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    char username[32];
    if (!Json_GetString(body, "username", username, sizeof(username))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"username required\"}");
        return 400;
    }
    
    if (!check_super_admin_access(current_user)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
        return 403;
    }
    
    /* Генерируем токен восстановления */
    char token[64];
    if (!UsersService_GenerateResetToken(username, token, sizeof(token))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Failed to generate reset token\"}");
        return 500;
    }
    
    (void)jw_appendf(&w, "{\"ok\":1,\"token\":\"%s\",\"message\":\"Reset token generated. Token expires in 15 minutes.\"}", token);
#if HTTP_DEBUG_ENABLED
    AppLog("AUTH: reset token generated for %s by %s", username, current_user);
#endif
    return 200;
}

/* =========================================================
 * POST /api/auth/reset-password - сброс пароля по токену
 * Доступно всем (кто имеет валидный токен)
 * ========================================================= */
static int post_auth_reset_password(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    /* Парсим token и newPassword */
    char token[64];
    char newPassword[64];
    
    if (!Json_GetString(body, "token", token, sizeof(token))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"token required\"}");
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
    
    if (newPwdLen > 64) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"New password too long\"}");
        return 400;
    }
    
    /* Сбрасываем пароль по токену */
    if (!UsersService_ResetPasswordByToken(token, newPassword)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Invalid or expired token\"}");
        return 400;
    }
    
    (void)jw_appendf(&w, "{\"ok\":1,\"message\":\"Password reset successfully\"}");
#if HTTP_DEBUG_ENABLED
    AppLog("AUTH: password reset via token");
#endif
    return 200;
}

/* =========================================================
 * POST /api/users - создание пользователя
 * Только для Super Admin; current_user из токена
 * ========================================================= */
static int post_users_create(const char *body, size_t body_len, const char *current_user,
                             char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    if (!check_super_admin_access(current_user)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
        return 403;
    }
    
    /* Парсим данные нового пользователя */
    char username[32];
    char password[64];
    char role_str[32];
    
    if (!Json_GetString(body, "username", username, sizeof(username))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"username required\"}");
        return 400;
    }
    
    if (!Json_GetString(body, "password", password, sizeof(password))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"password required\"}");
        return 400;
    }
    
    if (strlen(password) < 8) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Password must be at least 8 characters\"}");
        return 400;
    }
    
    if (!Json_GetString(body, "role", role_str, sizeof(role_str))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"role required\"}");
        return 400;
    }
    
    /* Преобразуем роль */
    user_role_t role = USER_ROLE_OPERATOR;
    if (strcmp(role_str, "super_admin") == 0)
        role = USER_ROLE_SUPER_ADMIN;
    else if (strcmp(role_str, "admin") == 0)
        role = USER_ROLE_ADMIN;
    else if (strcmp(role_str, "operator") == 0)
        role = USER_ROLE_OPERATOR;
    else {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Invalid role\"}");
        return 400;
    }
    
    /* Создаем пользователя */
    if (!UsersService_CreateUser(username, password, role)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Failed to create user\"}");
        return 500;
    }
    
    (void)jw_appendf(&w, "{\"ok\":1,\"message\":\"User created successfully\"}");
#if HTTP_DEBUG_ENABLED
    AppLog("USERS: created user %s by %s", username, current_user);
#endif
    return 200;
}

/* =========================================================
 * PUT /api/users/:username - обновление пользователя
 * Только для Super Admin; current_user из токена
 * ========================================================= */
static int put_users_update(const char *username_param, const char *body, size_t body_len,
                            const char *current_user, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!username_param || !body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"invalid request\"}");
        return 400;
    }
    
    char username[32];
    (void)strncpy(username, username_param, sizeof(username) - 1);
    username[sizeof(username) - 1] = 0;
    char *qmark = strchr(username, '?');
    if (qmark) *qmark = 0;
    
    if (!check_super_admin_access(current_user)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
        return 403;
    }
    
    /* Парсим данные для обновления */
    char new_password[64] = "";
    char role_str[32] = "";
    uint8_t enabled = 1U;
    
    Json_GetString(body, "password", new_password, sizeof(new_password));
    Json_GetString(body, "role", role_str, sizeof(role_str));
    
    int enabled_int = 1;
    if (Json_GetInt(body, "enabled", &enabled_int)) {
        enabled = (enabled_int != 0) ? 1U : 0U;
    }
    
    /* Преобразуем роль */
    user_role_t role = USER_ROLE_OPERATOR;
    if (strlen(role_str) > 0) {
        if (strcmp(role_str, "super_admin") == 0)
            role = USER_ROLE_SUPER_ADMIN;
        else if (strcmp(role_str, "admin") == 0)
            role = USER_ROLE_ADMIN;
        else if (strcmp(role_str, "operator") == 0)
            role = USER_ROLE_OPERATOR;
        else {
            (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Invalid role\"}");
            return 400;
        }
    } else {
        /* Если роль не указана, получаем текущую */
        const user_record_t *user = UsersService_FindUser(username);
        if (user) {
            role = user->role;
        }
    }
    
    /* Обновляем пользователя */
    const char *pwd_to_update = (strlen(new_password) > 0) ? new_password : NULL;
    if (!UsersService_UpdateUser(username, pwd_to_update, role, enabled)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Failed to update user\"}");
        return 500;
    }
    
    (void)jw_appendf(&w, "{\"ok\":1,\"message\":\"User updated successfully\"}");
#if HTTP_DEBUG_ENABLED
    AppLog("USERS: updated user %s by %s", username, current_user);
#endif
    return 200;
}

/* =========================================================
 * DELETE /api/users/:username - удаление пользователя
 * Только для Super Admin; current_user из токена
 * ========================================================= */
static int delete_users_remove(const char *username_param, const char *body, size_t body_len,
                               const char *current_user, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!username_param) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"invalid request\"}");
        return 400;
    }
    
    char username[32];
    (void)strncpy(username, username_param, sizeof(username) - 1);
    username[sizeof(username) - 1] = 0;
    char *qmark = strchr(username, '?');
    if (qmark) *qmark = 0;
    
    if (!check_super_admin_access(current_user)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
        return 403;
    }
    
    /* Нельзя удалить самого себя */
    if (strcmp(username, current_user) == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Cannot delete yourself\"}");
        return 400;
    }
    
    /* Удаляем пользователя */
    if (!UsersService_DeleteUser(username)) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Failed to delete user\"}");
        return 500;
    }
    
    (void)jw_appendf(&w, "{\"ok\":1,\"message\":\"User deleted successfully\"}");
#if HTTP_DEBUG_ENABLED
    AppLog("USERS: deleted user %s by %s", username, current_user);
#endif
    return 200;
}

int HttpApi_HandlePost(const char *path,
                      const char *body, size_t body_len,
                      const char *headers, int headers_len,
                      char *out_body, size_t out_sz)
{
    if (!path || !out_body || out_sz == 0U) return 500;
    
    /* Публичные POST без токена: только логин и сброс пароля по токену */
    if (strcmp(path, "/api/auth/login") == 0 || strcmp(path, "/auth/login") == 0) {
        return post_auth_login(body, body_len, out_body, out_sz, headers, headers_len);
    }
    if (strcmp(path, "/api/auth/reset-password") == 0 || strcmp(path, "/auth/reset-password") == 0) {
        return post_auth_reset_password(body, body_len, out_body, out_sz);
    }
    
    /* Остальные POST требуют валидный токен; current_user из сессии */
    char current_user[32];
    int auth_code = require_auth(headers, headers_len, out_body, out_sz, current_user, sizeof(current_user));
    if (auth_code != 200)
        return 401;
    
    if (strcmp(path, "/api/auth/change-password") == 0 || strcmp(path, "/auth/change-password") == 0) {
        return post_auth_change_password(body, body_len, current_user, out_body, out_sz);
    }
    /* POST /api/auth/logout — выход с фиксацией в журнале (имя пользователя и время с ПК) */
    if (strcmp(path, "/api/auth/logout") == 0 || strcmp(path, "/auth/logout") == 0) {
        uint32_t client_ts = 0U;
        (void)get_client_time_from_headers(headers, headers_len, &client_ts);
        EventJournal_LogUserAction(4 /*USER_LOGOUT*/, current_user, client_ts, 1);
        (void)snprintf(out_body, out_sz, "{\"ok\":1}");
        return 200;
    }
    
    if (strcmp(path, "/api/auth/forgot-password") == 0 || strcmp(path, "/auth/forgot-password") == 0) {
        return post_auth_forgot_password(body, body_len, current_user, out_body, out_sz);
    }
    
    if (strcmp(path, "/api/users") == 0 || strcmp(path, "/users") == 0) {
        return post_users_create(body, body_len, current_user, out_body, out_sz);
    }
    /* POST /api/journal/clear — очистка журнала событий на контроллере.
     * Сделано как POST (а не DELETE), чтобы избежать ограничений некоторых HTTP-клиентов
     * и оставить единый путь обработки в существующем обработчике POST.
     * Доступ оставляем только для Super Admin из соображений безопасности:
     * очистка журнала — потенциально критичное действие аудита. */
    if (strcmp(path, "/api/journal/clear") == 0) {
        if (!check_super_admin_access(current_user)) {
            (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
            return 403;
        }
        journal_status_t st = EventJournal_EraseAll();
        if (st == JOURNAL_OK) {
            (void)snprintf(out_body, out_sz, "{\"ok\":1}");
            return 200;
        }
        (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Journal clear failed\",\"status\":%u}", (unsigned)st);
        return 500;
    }
    /* POST /api/time — установка времени RTC из UI (тело: {"unix": <секунды с 1970-01-01>}) */
    if (strcmp(path, "/api/time") == 0) {
        uint32_t unix_sec = 0U;
        if (!Json_GetUint32(body, "unix", &unix_sec)) {
            (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"Missing or invalid unix\"}");
            return 400;
        }
        if (RTC_SetFromUnix(unix_sec))
            (void)snprintf(out_body, out_sz, "{\"ok\":1}");
        else {
            (void)snprintf(out_body, out_sz, "{\"ok\":0,\"error\":\"RTC write failed\"}");
            return 500;
        }
        return 200;
    }
    if (strcmp(path, "/api/flash/scan") == 0) {
        return post_flash_scan(current_user, out_body, out_sz);
    }
    /* POST /api/flash/clear — полная очистка пользовательских областей QSPI.
     * После успеха контроллер перезагружается автоматически. */
    if (strcmp(path, "/api/flash/clear") == 0) {
        return post_flash_clear_all(body, body_len, current_user, out_body, out_sz);
    }
    
    if (strncmp(path, "/api/users/", 11) == 0) {
        const char *rest = path + 11;
        const char *delete_pos = strstr(rest, "/delete");
        if (delete_pos && strlen(rest) > 7) {
            char username[32];
            size_t len = (size_t)(delete_pos - rest);
            if (len < sizeof(username)) {
                (void)strncpy(username, rest, len);
                username[len] = 0;
                return delete_users_remove(username, body, body_len, current_user, out_body, out_sz);
            }
        }
    }
    
    /* unknown path */
    if (out_body && out_sz) {
        jsonw_t w;
        jw_init(&w, out_body, out_sz);
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Path not found\"}");
    }
    return 404;
}
