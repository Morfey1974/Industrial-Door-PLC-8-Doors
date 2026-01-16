#pragma once

#include <stdint.h>

#include "config/config_format.h"

/* =========================================================
 * ЭТАП 7 (MASTER-only)
 * Хранение конфигурации в QSPI Flash.
 *
 * Реализует:
 *  - LoadActive: загрузка активной конфигурации (выбор валидного слота по seq)
 *  - SaveNew: атомарная запись нового конфига в неактивный слот (write payload, write header last)
 *  - InitOrDefault: при старте MASTER загружает конфиг или создает default и записывает
 * ========================================================= */

#ifdef __cplusplus
extern "C" {
#endif

typedef enum
{
    CFGST_OK = 0,
    CFGST_NO_VALID = 1,
    CFGST_IO_ERROR = 2,
    CFGST_BAD_FORMAT = 3,
    /* service-layer statuses */
    CFGST_ARG = 4,
    CFGST_NOT_MASTER = 5,
} cfg_storage_status_t;

typedef struct
{
    cfg_storage_status_t status;
    uint8_t used_slot;       /* 0 = none, 1 = A, 2 = B */
    uint32_t seq;            /* sequence number */
} cfg_storage_info_t;

cfg_storage_status_t ConfigStorage_LoadActive(project_config_t *out_cfg, cfg_storage_info_t *out_info);

cfg_storage_status_t ConfigStorage_SaveNew(const project_config_t *cfg, cfg_storage_info_t *inout_info);

/* На MASTER: загрузить конфиг. Если валидного нет - создать default и сохранить атомарно. */
cfg_storage_status_t ConfigStorage_InitOrDefault(project_config_t *out_cfg, cfg_storage_info_t *out_info);

#ifdef __cplusplus
}
#endif
