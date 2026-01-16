#pragma once

#include <stdint.h>

#include "config/config_format.h"          /* project_config_t */
#include "config/config_storage_qspi.h"   /* cfg_storage_status_t, cfg_storage_info_t */

#ifdef __cplusplus
extern "C" {
#endif

/* Optional logging hook (printf-like messages already formatted).
 * If left NULL - no logging.
 */
extern void (*ConfigService_LogWrite)(const char *msg);

/* Boot: read-only load. Если слоты невалидны — дефолт в RAM. */
cfg_storage_status_t ConfigService_BootLoad(project_config_t *out_cfg, cfg_storage_info_t *out_info);

/* Совместимость с тем, что уже вставлено в main.c */
void ConfigService_InitOnBoot(project_config_t *out_cfg);

/* Persist: атомарная запись Slot A/B. Вызывать после старта RTOS. */
cfg_storage_status_t ConfigService_Persist(const project_config_t *cfg);

#ifdef __cplusplus
}
#endif
