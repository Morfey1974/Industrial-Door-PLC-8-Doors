#pragma once

#include <stdint.h>

/* Тот же каталог App/config — без префикса config/, иначе нужен -I../App в каждом subdir.mk */
#include "config_format.h"

/* =========================================================
 * ЭТАП 7 — хранение конфигурации в QSPI Flash (один контроллер).
 *
 * Реализует:
 *  - LoadActive: загрузка активной конфигурации (выбор валидного слота по seq)
 *  - SaveNew: атомарная запись нового конфига в неактивный слот (write payload, write header last)
 *  - InitOrDefault: при старте загрузка конфига или default в RAM
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
} cfg_storage_status_t;

typedef struct
{
    cfg_storage_status_t status;
    uint8_t used_slot;       /* 0 = none, 1 = A, 2 = B */
    uint32_t seq;            /* sequence number */
} cfg_storage_info_t;

cfg_storage_status_t ConfigStorage_LoadActive(project_config_t *out_cfg, cfg_storage_info_t *out_info);

cfg_storage_status_t ConfigStorage_SaveNew(const project_config_t *cfg, cfg_storage_info_t *inout_info);

/* Загрузить конфиг; если валидного нет — default в RAM (без записи во flash). */
cfg_storage_status_t ConfigStorage_InitOrDefault(project_config_t *out_cfg, cfg_storage_info_t *out_info);

#ifdef __cplusplus
}
#endif
