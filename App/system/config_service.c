#include "config_service.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include "config/config_format.h"
#include "config/config_storage_qspi.h"
#include "system_node.h"

#include "doors/doors_task.h"  /* For Doors_RequestLock, Doors_GetState */
#include "system/app_events.h" /* For APP_SRC_SUPERVISOR */
#include "comms_task.h"        /* For CommsTask_GetLogicCore */
#include "logic/logic_core.h"  /* For LogicCore_RecomputeAndApply */
#include "system/http_server.h"/* For HTTP_FIXED_PORT */

/* Примечание по диагностике загрузки конфигурации (этап 7.1/7.2):
 * - В раннем буте LoggerTask может ещё не работать, поэтому AppLog() может быть не виден.
 * - А вот printf() уже используется (см. BOOT: ...), поэтому ключевые строки вида
 *   "CFG: slot A OK" печатаем через printf() тоже.
 */

/* Optional log sink (set by application) */
void (*ConfigService_LogWrite)(const char *msg) = 0;

/* Optional runtime hooks (exist in your project): */
/* - DoorsCfg_SetOpenTimeoutMs(uint32_t ms) */
/* - DoorsCfg_SetPostCloseTimeoutMs(uint8_t localDoor, uint32_t ms) */
/* If headers are not available here, we declare weak externs to avoid hard coupling. */
/* Note: These functions return uint8_t, not void */
extern uint8_t DoorsCfg_SetOpenTimeoutMs(uint32_t ms) __attribute__((weak));
extern uint8_t DoorsCfg_SetPostCloseTimeoutMs(uint8_t localDoor, uint32_t ms) __attribute__((weak));

/* Global active configuration (referenced by LogicCore and other modules) */
project_config_t g_project_cfg;

/* После миграции v1→v2 в RAM — записать v2 во flash из doorsTask (RTOS уже запущен). */
static uint8_t s_persist_migrated_v2 = 0U;

cfg_storage_status_t ConfigService_BootLoad(project_config_t *out_cfg, cfg_storage_info_t *out_info)
{
    if (!out_cfg || !out_info) return CFGST_ARG;
    return ConfigStorage_LoadActive(out_cfg, out_info);
}

static void log_msg(const char *fmt, ...)
{
    if (!ConfigService_LogWrite) return;

    char buf[160];
    va_list ap;
    va_start(ap, fmt);
    (void)vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);

    ConfigService_LogWrite(buf);
}

static void apply_cfg_runtime(const project_config_t *cfg)
{
    if (!cfg) return;

    /* 0) Валидация: не применяем невалидный конфиг (защита от блокировки всех дверей при ошибке) */
    cfg_validate_error_t err;
    memset(&err, 0, sizeof(err));
    if (Config_Validate(cfg, &err) != CFG_VALIDATE_OK) {
        log_msg("[CFG] apply: skip invalid cfg: %s\r\n", err.text);
        return;
    }

    /* 1) Global open timeout (same for all doors, set from WEB later) */
    if (DoorsCfg_SetOpenTimeoutMs) {
        log_msg("[CFG] apply: openTimeoutMs=%lu\r\n", (unsigned long)cfg->openTimeoutMs);
        DoorsCfg_SetOpenTimeoutMs(cfg->openTimeoutMs);
    } else {
        log_msg("[CFG] apply: DoorsCfg_SetOpenTimeoutMs not available\r\n");
    }

    /* 1b) NC: окно разблокировки и задержка блокировки после закрытия */
    DoorsCfg_SetNcUnlockWindowMs(cfg->ncUnlockWindowMs);
    DoorsCfg_SetNcLockDelayAfterCloseMs(cfg->ncLockDelayAfterCloseMs);

    /* 2) Per-door post-close timeout and door type
     *    - cfg->postCloseTimeoutMs[] is indexed by globalDoorId-1 (1..80)
     *    - Apply only doors hosted on this node (AppNodeId == cfg->doors[i].nodeId)
     *    - Apply door type: NC doors should be locked by default when closed
     */
    if (DoorsCfg_SetPostCloseTimeoutMs) {
        log_msg("[CFG] apply: postCloseTimeouts for %u doors\r\n", (unsigned)cfg->doorCount);
        uint8_t appliedCount = 0U;
        for (uint16_t i = 0; i < cfg->doorCount && i < CFG_MAX_DOORS; i++) {
            const cfg_door_t *d = &cfg->doors[i];
            if (d->nodeId != System_GetNodeId()) {
                continue;
            }
            if (d->localDoor < 1U || d->localDoor > 8U) {
                continue;
            }

            const uint8_t gid = Config_MakeGlobalDoorId(d->nodeId, d->localDoor);
            if (gid < 1U || gid > CFG_MAX_DOORS) {
                continue;
            }
            /* Защита от выхода за границу массива postCloseTimeoutMs */
            if ((size_t)(gid - 1U) >= CFG_MAX_DOORS) {
                continue;
            }

            uint32_t timeout = cfg->postCloseTimeoutMs[gid - 1U];
            log_msg("[CFG] apply: door%u (gid=%u) postCloseTimeoutMs=%lu\r\n", 
                    (unsigned)d->localDoor, (unsigned)gid, (unsigned long)timeout);
            DoorsCfg_SetPostCloseTimeoutMs(d->localDoor, timeout);
            
            /* 3) NC: блокировка при закрытии — только когда doorsTask поднял мьютекс и HAL.
             * В main() до RTOS Doors_GetState/RequestLock не работают — иначе гонка и ложные lock. */
            if (d->type == DOOR_TYPE_NC && Doors_IsRuntimeReady()) {
                AppDoorState_t state;
                if (Doors_GetState(d->localDoor, &state)) {
                    if (state.physClosed && !state.alarming) {
                        Doors_RequestLock(d->localDoor, 1U, (uint32_t)APP_SRC_SUPERVISOR, 0U);
                    }
                }
            }
            
            appliedCount++;
        }
    } else {
        log_msg("[CFG] apply: DoorsCfg_SetPostCloseTimeoutMs not available\r\n");
    }

    /* Слоты без записи в конфиге — сброс только когда doorsTask готова */
    if (Doors_IsRuntimeReady())
        Doors_RefreshUnusedLocalSlots();
}

/* Публичная функция для применения конфигурации в runtime */
void ConfigService_ApplyRuntime(const project_config_t *cfg)
{
    apply_cfg_runtime(cfg);

    /* После применения конфигурации пересчитываем логику,
     * чтобы NC двери были добавлены в lockRequired
     */
    extern logic_core_t* CommsTask_GetLogicCore(void);
    logic_core_t *lc = CommsTask_GetLogicCore();
    if (lc) {
        extern void LogicCore_RecomputeAndApply(logic_core_t *lc);
        LogicCore_RecomputeAndApply(lc);
    }
}

void ConfigService_InitOnBoot(project_config_t *out_cfg)
{
    if (!out_cfg) out_cfg = &g_project_cfg;

    cfg_storage_info_t info;
    memset(&info, 0, sizeof(info));
    const cfg_storage_status_t st = ConfigStorage_InitOrDefault(out_cfg, &info);

    if (st == CFGST_OK && info.migrated_from_v1 != 0U)
        s_persist_migrated_v2 = 1U;

    if (st != CFGST_OK) {
        printf("[CFG] boot: flash load failed st=%u, RAM default (8 NC doors)\r\n",
               (unsigned)st);
    } else {
        printf("[CFG] boot: slot=%u seq=%lu doors=%u%s\r\n",
               (unsigned)info.used_slot,
               (unsigned long)info.seq,
               (unsigned)out_cfg->doorCount,
               info.migrated_from_v1 ? " migrated_v1" : "");
    }

    /* Нормализация: порт HTTP-сервера зашит в прошивке (HTTP_FIXED_PORT).
     * Если в QSPI лежит старая запись с другим webPort (например, 8080),
     * приводим RAM-копию к фактическому порту — UI получит честное значение,
     * а HttpServer всё равно слушает HTTP_FIXED_PORT. Запись в QSPI не трогаем
     * здесь, чтобы не плодить лишние циклы стирания; конфиг сам «починится»
     * при следующем сохранении из UI (там тоже forсe webPort=HTTP_FIXED_PORT). */
    if (out_cfg->net.webPort != (uint16_t)HTTP_FIXED_PORT) {
        log_msg("[CFG] boot: webPort %u in QSPI -> %u (fixed by firmware)\r\n",
                (unsigned)out_cfg->net.webPort,
                (unsigned)HTTP_FIXED_PORT);
        out_cfg->net.webPort = (uint16_t)HTTP_FIXED_PORT;
    }

    /* Optional external sink (if application sets ConfigService_LogWrite) */
    log_msg("[CFG] boot: status=%u slot=%d seq=%lu webPort=%u\r\n",
            (unsigned)info.status,
            (int)info.used_slot,
            (unsigned long)info.seq,
            (unsigned)out_cfg->net.webPort);

    apply_cfg_runtime(out_cfg);
}

cfg_storage_status_t ConfigService_Persist(const project_config_t *cfg,
                                           const char *username,
                                           uint32_t client_unix_sec)
{
    if (!cfg) return CFGST_ARG;

    cfg_storage_info_t info;
    cfg_storage_status_t st = ConfigStorage_LoadActive(&g_project_cfg, &info);
    if (st != CFGST_OK) {
        info.used_slot = 0U;
        info.seq = 0U;
    }

    st = ConfigStorage_SaveNew(cfg, &info);

    log_msg("[CFG] persist: status=%u slot=%d seq=%lu\r\n",
            (unsigned)st,
            (int)info.used_slot,
            (unsigned long)info.seq);

    return st;
}

void ConfigService_PostBootPersistIfNeeded(void)
{
    if (s_persist_migrated_v2 == 0U)
        return;
    s_persist_migrated_v2 = 0U;

    const cfg_storage_status_t st = ConfigService_Persist(&g_project_cfg, NULL, 0U);
    printf("[CFG] auto-persist v2 after v1 migrate: status=%u\r\n", (unsigned)st);
}
