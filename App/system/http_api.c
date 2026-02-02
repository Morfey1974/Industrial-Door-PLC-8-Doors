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

#include "config/config_format.h"
#include "config/mapping_storage_qspi.h"
#include "logic/logic_deps.h"

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
                uint8_t open = lc->physOpen[globalDoorId - 1U];
                physClosed = open ? 0U : 1U;
                /* Состояние блокировки по зависимостям — чтобы на карте в режиме просмотра отображалась анимация */
                locked = DoorBitset_Test(&lc->lockRequired, globalDoorId) ? 1U : 0U;
                alarming = 0U;
                alarmReasons = 0UL;
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

/* Парсер query параметра для строки */
static uint8_t parse_query_string(const char *path, const char *key, char *out, size_t out_cap)
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

/* Forward declaration для put_users_update */
static int put_users_update(const char *username_param, const char *body, size_t body_len, char *out_body, size_t out_sz);

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
    size_t to_copy = body_len;
    if (to_copy > MAPPING_STORAGE_MAX_LEN)
        to_copy = MAPPING_STORAGE_MAX_LEN;
    MappingStorage_SetData(body, to_copy);
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
    if (strcmp(path, "/api/config/mapping") == 0)
    {
        return build_mapping(&w) ? 200 : 500;
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

    /* GET /api/users - список пользователей (только для Super Admin) */
    if (strcmp(path, "/api/users") == 0 || strncmp(path, "/api/users?", 11) == 0)
    {
        /* Проверка прав доступа через query параметр currentUser */
        char current_user[32];
        if (parse_query_string(path, "currentUser", current_user, sizeof(current_user)))
        {
            if (!check_super_admin_access(current_user))
            {
                (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Access denied. Super Admin only\"}");
                return 403;
            }
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
        st = ConfigService_Persist(&cfg);
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

/* Статический буфер для разбора PUT /api/config/full (project_config_t ~6KB — не на стеке HTTP-задачи). */
static project_config_t s_put_cfg;

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
                    if (strncmp(ts, "NO", 2) == 0) d->type = (uint8_t)DOOR_TYPE_NO;
                    else if (strncmp(ts, "CARD_READER", 11) == 0) d->type = (uint8_t)DOOR_TYPE_CARD_READER;
                    else d->type = (uint8_t)DOOR_TYPE_NC;
                }
            }
            memset(d->comment, 0, sizeof(d->comment));
            (void)Json_GetString(elem_buf, "comment", d->comment, sizeof(d->comment));
            cfg->doorCount++;
        }
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
        st = ConfigService_Persist(cfg);
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
    if (strcmp(path, "/api/config/mapping") == 0) {
        return put_mapping(body, body_len, out_body, out_sz);
    }
    
    /* PUT /api/users/:username - обновление пользователя (только Super Admin) */
    if (strncmp(path, "/api/users/", 11) == 0) {
        return put_users_update(path + 11, body, body_len, out_body, out_sz);
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
        
        /* Успешный вход */
        (void)jw_appendf(&w, "{\"ok\":1,\"role\":\"%s\",\"username\":\"%s\",\"token\":\"debug_token_%lu\"}",
                         role_str, username, (unsigned long)HAL_GetTick());
        AppLog("AUTH: login success for %s (role=%s)", username, role_str);
        return 200;
    }
    
    /* Неверные учетные данные */
    (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"Invalid credentials\"}");
    AppLog("AUTH: login failed for %s", username);
    return 401;
}

/* =========================================================
 * POST /api/auth/change-password - изменение пароля
 * 
 * Использует UsersService для работы с базой пользователей в QSPI
 * ========================================================= */
static int post_auth_change_password(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    /* Парсим username, currentPassword и newPassword из JSON */
    char username[32];
    char currentPassword[64];
    char newPassword[64];
    
    /* Username опционален - если не указан, используем текущего пользователя из сессии */
    /* TODO: В будущем получать из токена/сессии */
    if (!Json_GetString(body, "username", username, sizeof(username))) {
        /* По умолчанию для отладки используем "admin" */
        (void)strncpy(username, "admin", sizeof(username) - 1);
        username[sizeof(username) - 1] = 0;
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
        AppLog("AUTH: change password failed - incorrect current password for %s", username);
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
        AppLog("AUTH: change password failed - update error for %s", username);
        return 500;
    }
    
    (void)jw_appendf(&w, "{\"ok\":1,\"message\":\"Password changed successfully\"}");
    AppLog("AUTH: password changed successfully for %s", username);
    return 200;
}

/* =========================================================
 * POST /api/auth/forgot-password - запрос токена восстановления пароля
 * Только для Super Admin (для генерации токена)
 * ========================================================= */
static int post_auth_forgot_password(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    /* Парсим username и currentUser (для проверки прав) */
    char username[32];
    char current_user[32];
    
    if (!Json_GetString(body, "username", username, sizeof(username))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"username required\"}");
        return 400;
    }
    
    /* Проверка прав доступа - только Super Admin может генерировать токены */
    if (!Json_GetString(body, "currentUser", current_user, sizeof(current_user))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"currentUser required\"}");
        return 403;
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
    AppLog("AUTH: reset token generated for %s by %s", username, current_user);
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
    AppLog("AUTH: password reset via token");
    return 200;
}

/* =========================================================
 * POST /api/users - создание пользователя
 * Только для Super Admin
 * ========================================================= */
static int post_users_create(const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"empty body\"}");
        return 400;
    }
    
    /* Проверка прав доступа */
    char current_user[32];
    if (!Json_GetString(body, "currentUser", current_user, sizeof(current_user))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"currentUser required\"}");
        return 403;
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
    AppLog("USERS: created user %s by %s", username, current_user);
    return 200;
}

/* =========================================================
 * PUT /api/users/:username - обновление пользователя
 * Только для Super Admin
 * ========================================================= */
static int put_users_update(const char *username_param, const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!username_param || !body || body_len == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"invalid request\"}");
        return 400;
    }
    
    /* Извлекаем username из пути (убираем query параметры если есть) */
    char username[32];
    (void)strncpy(username, username_param, sizeof(username) - 1);
    username[sizeof(username) - 1] = 0;
    char *qmark = strchr(username, '?');
    if (qmark) *qmark = 0;
    
    /* Проверка прав доступа */
    char current_user[32];
    if (!Json_GetString(body, "currentUser", current_user, sizeof(current_user))) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"currentUser required\"}");
        return 403;
    }
    
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
    AppLog("USERS: updated user %s by %s", username, current_user);
    return 200;
}

/* =========================================================
 * DELETE /api/users/:username - удаление пользователя
 * Только для Super Admin
 * ========================================================= */
static int delete_users_remove(const char *username_param, const char *body, size_t body_len, char *out_body, size_t out_sz)
{
    jsonw_t w;
    jw_init(&w, out_body, out_sz);
    
    if (!username_param) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"invalid request\"}");
        return 400;
    }
    
    /* Извлекаем username из пути */
    char username[32];
    (void)strncpy(username, username_param, sizeof(username) - 1);
    username[sizeof(username) - 1] = 0;
    char *qmark = strchr(username, '?');
    if (qmark) *qmark = 0;
    
    /* Проверка прав доступа */
    char current_user[32] = "";
    if (body && body_len > 0) {
        Json_GetString(body, "currentUser", current_user, sizeof(current_user));
    }
    
    if (strlen(current_user) == 0) {
        (void)jw_appendf(&w, "{\"ok\":0,\"error\":\"currentUser required\"}");
        return 403;
    }
    
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
    AppLog("USERS: deleted user %s by %s", username, current_user);
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
    /* Проверяем оба варианта пути: с /api и без (axios может отправлять без /api, если baseURL уже содержит /api) */
    if (strcmp(path, "/api/auth/login") == 0 || strcmp(path, "/auth/login") == 0) {
        return post_auth_login(body, body_len, out_body, out_sz);
    }
    
    if (strcmp(path, "/api/auth/change-password") == 0 || strcmp(path, "/auth/change-password") == 0) {
        return post_auth_change_password(body, body_len, out_body, out_sz);
    }
    
    if (strcmp(path, "/api/auth/forgot-password") == 0 || strcmp(path, "/auth/forgot-password") == 0) {
        return post_auth_forgot_password(body, body_len, out_body, out_sz);
    }
    
    if (strcmp(path, "/api/auth/reset-password") == 0 || strcmp(path, "/auth/reset-password") == 0) {
        return post_auth_reset_password(body, body_len, out_body, out_sz);
    }
    
    /* POST /api/users - создание пользователя (только Super Admin) */
    if (strcmp(path, "/api/users") == 0 || strcmp(path, "/users") == 0) {
        return post_users_create(body, body_len, out_body, out_sz);
    }
    
    /* POST /api/users/:username/delete - удаление пользователя (только Super Admin) */
    if (strncmp(path, "/api/users/", 11) == 0) {
        const char *rest = path + 11;
        const char *delete_pos = strstr(rest, "/delete");
        if (delete_pos && strlen(rest) > 7) {
            char username[32];
            size_t len = (size_t)(delete_pos - rest);
            if (len < sizeof(username)) {
                (void)strncpy(username, rest, len);
                username[len] = 0;
                return delete_users_remove(username, body, body_len, out_body, out_sz);
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
