#include "config_service.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include "config/config_format.h"
#include "config/config_storage_qspi.h"
#include "system_node.h"

#include "log/event_journal.h"

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
extern void DoorsCfg_SetOpenTimeoutMs(uint32_t ms) __attribute__((weak));
extern void DoorsCfg_SetPostCloseTimeoutMs(uint8_t localDoor, uint32_t ms) __attribute__((weak));

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

    /* 1) Global open timeout (same for all doors, set from WEB later) */
    if (DoorsCfg_SetOpenTimeoutMs) {
        DoorsCfg_SetOpenTimeoutMs(cfg->openTimeoutMs);
    }

    /* 2) Per-door post-close timeout
     *    - cfg->postCloseTimeoutMs[] is indexed by globalDoorId-1 (1..80)
     *    - Apply only doors hosted on this node (AppNodeId == cfg->doors[i].nodeId)
     */
    if (DoorsCfg_SetPostCloseTimeoutMs) {
        for (uint16_t i = 0; i < cfg->doorCount; i++) {
            const cfg_door_t *d = &cfg->doors[i];
            if (d->nodeId != System_GetNodeId()) continue;
            if (d->localDoor < 1U || d->localDoor > 8U) continue;

            const uint8_t gid = Config_MakeGlobalDoorId(d->nodeId, d->localDoor);
            if (gid < 1U || gid > CFG_MAX_DOORS) continue;

            DoorsCfg_SetPostCloseTimeoutMs(d->localDoor, cfg->postCloseTimeoutMs[gid - 1U]);
        }
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

    /* Minimal diagnostics (видно сразу в UART, до старта LoggerTask) */
    if (info.status == CFGST_OK && (info.used_slot == 1U || info.used_slot == 2U)) {
        const char slot_ch = (info.used_slot == 1U) ? 'A' : 'B';
        printf("CFG: slot %c OK (seq=%lu)\r\n", slot_ch, (unsigned long)info.seq);
    } else {
        printf("CFG: default (st=%u)\r\n", (unsigned)info.status);
    }

    /* Optional external sink (if application sets ConfigService_LogWrite) */
    log_msg("[CFG] boot: status=%u slot=%d seq=%lu\r\n",
            (unsigned)info.status,
            (int)info.used_slot,
            (unsigned long)info.seq);

    /* Журнал: фиксируем факт загрузки/инициализации конфигурации */
    EventJournal_LogConfigAction(1 /*BOOT_LOAD*/, info.seq, 0, (uint32_t)info.status);

    apply_cfg_runtime(out_cfg);
}

cfg_storage_status_t ConfigService_Persist(const project_config_t *cfg)
{
    if (!cfg) return CFGST_ARG;
    if (System_GetRole() != APP_ROLE_MASTER) return CFGST_NOT_MASTER;

    cfg_storage_info_t info;
    cfg_storage_status_t st = ConfigStorage_LoadActive(&g_project_cfg, &info);
    /* If nothing active yet, still allow save (slot choice handled by storage layer) */
    if (st != CFGST_OK) {
        info.used_slot = 0U;
        info.seq = 0U;
    }

    st = ConfigStorage_SaveNew(cfg, &info);
    log_msg("[CFG] persist: status=%u slot=%d seq=%lu\r\n",
            (unsigned)st,
            (int)info.used_slot,
            (unsigned long)info.seq);

    /* Журнал: попытка записи нового конфига (result = st) */
    EventJournal_LogConfigAction(2 /*PERSIST*/, info.seq, 0, (uint32_t)st);
    return st;
}
