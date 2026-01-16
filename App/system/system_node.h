#pragma once

#include <stdint.h>

/* =========================================================
 * ЭТАП 6.1–6.2: Node ID и роль платы
 *
 * По глобальному плану:
 *  - NodeID: 1..10
 *  - NodeID == 1 => MASTER
 *  - NodeID  != 1 => SLAVE
 *
 * На текущем этапе NodeID задаётся на этапе сборки (макрос APP_NODE_ID)
 * или остаётся значением по умолчанию (=1).
 *
 * Позже (Этап 7/11) NodeID будет приходить из конфигурации в QSPI/WEB.
 * ========================================================= */

typedef enum
{
    APP_ROLE_MASTER = 0,
    APP_ROLE_SLAVE  = 1
} app_role_t;

/* Возвращает NodeID 1..10. При неверном APP_NODE_ID возвращает 1. */
uint8_t System_GetNodeId(void);

/* Возвращает роль в соответствии с правилом NodeID==1. */
app_role_t System_GetRole(void);
