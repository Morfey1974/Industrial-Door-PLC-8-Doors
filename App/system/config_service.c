#include "config_service.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include "config/config_format.h"
#include "config/config_storage_qspi.h"
#include "system_node.h"

#include "log/event_journal.h"
#include "doors/doors_task.h"  /* For Doors_RequestLock, Doors_GetState */
#include "system/app_events.h" /* For APP_SRC_SUPERVISOR */
#include "comms_task.h"        /* For CommsTask_GetLogicCore */
#include "logic/logic_core.h"  /* For LogicCore_RecomputeAndApply */

/* Примечание: приостановка JournalTask на время persist отключена.
 * При suspend JournalTask может удерживать AppQspiLock (в WriteEventToFlash).
 * SaveNew затем блокируется на Lock → дедлок. Лог обрывается на "[CFG] SaveNew: eras".
 * Оставляем конкуренцию за QSPI; при необходимости — отдельный механизм
 * (например, флаг "persist in progress", который JournalTask учитывает).
 */

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
            
            /* 3) Apply door type: NC doors should be locked by default when closed
             * According to plan section 3.9.2: NC doors should be locked in safe state
             * This applies only to local doors on this node
             */
            if (d->type == DOOR_TYPE_NC) {
                /* For NC doors, check if door is closed and apply lock */
                AppDoorState_t state;
                if (Doors_GetState(d->localDoor, &state)) {
                        if (state.physClosed && !state.alarming) {
                        /* Door is closed and not in alarm - apply lock for NC type */
                        Doors_RequestLock(d->localDoor, 1U, (uint32_t)APP_SRC_SUPERVISOR, 0U);
                    }
                }
            }
            
            appliedCount++;
        }
    } else {
        log_msg("[CFG] apply: DoorsCfg_SetPostCloseTimeoutMs not available\r\n");
    }
}

/* Публичная функция для применения конфигурации в runtime */
void ConfigService_ApplyRuntime(const project_config_t *cfg)
{
    apply_cfg_runtime(cfg);
    
    /* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: передача openTimeoutMs на SLAVE через CAN
     * 
     * Проблема: на SLAVE при загрузке используется Config_Default, который
     * устанавливает openTimeoutMs = 30 секунд. Когда конфигурация загружается
     * на MASTER, SLAVE не получает обновленный openTimeoutMs, потому что
     * конфигурация хранится только на MASTER.
     * 
     * Решение: на MASTER после применения конфигурации отправляем openTimeoutMs
     * всем онлайн SLAVE узлам через CAN SERVICE кадр.
     */
    if (System_GetRole() == APP_ROLE_MASTER && cfg)
    {
        extern void CanTask_SendConfigParams(void);
        CanTask_SendConfigParams();
    }
    
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

    /* Per plan, only MASTER owns config persistence. Slaves use compiled defaults for now. */
    if (System_GetRole() != APP_ROLE_MASTER) {
        Config_Default(out_cfg);
        Config_Finalize(out_cfg);
        apply_cfg_runtime(out_cfg);
        log_msg("[CFG] slave: using defaults\r\n");
        return;
    }

    cfg_storage_info_t info;
    const cfg_storage_status_t st = ConfigStorage_InitOrDefault(out_cfg, &info);
    (void)st;

    /* Optional external sink (if application sets ConfigService_LogWrite) */
    log_msg("[CFG] boot: status=%u slot=%d seq=%lu\r\n",
            (unsigned)info.status,
            (int)info.used_slot,
            (unsigned long)info.seq);

    /* Журнал: фиксируем факт загрузки/инициализации конфигурации */
    EventJournal_LogConfigAction(1 /*BOOT_LOAD*/, info.seq, 0, (uint32_t)info.status);

    apply_cfg_runtime(out_cfg);
}

cfg_storage_status_t ConfigService_Persist(const project_config_t *cfg,
                                           const char *username,
                                           uint32_t client_unix_sec)
{
    if (!cfg) return CFGST_ARG;
    if (System_GetRole() != APP_ROLE_MASTER) return CFGST_NOT_MASTER;

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

    /* Журнал: из UI — имя пользователя и время с ПК; иначе — RTC (как раньше) */
    if (username != NULL && client_unix_sec != 0U)
        EventJournal_LogUserAction(2 /*CONFIG_SAVE*/, username, client_unix_sec, (uint32_t)st);
    else
        EventJournal_LogConfigAction(2 /*PERSIST*/, info.seq, 0, (uint32_t)st);
    return st;
}
