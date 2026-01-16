#pragma once
#include <stdint.h>

/* ============================================================
 * GlobalDoorId helpers (по ТЗ 2.3.5)
 *
 * Ограничения масштаба:
 *  - nodeId: 1..10
 *  - localDoor: 1..8
 *  - globalDoorId: 1..80
 *
 * Формула (1-based):
 *  globalDoorId = (nodeId - 1) * 8 + localDoor
 * ============================================================ */

#ifndef APP_MAX_NODES
#define APP_MAX_NODES 10
#endif

#ifndef APP_DOORS_PER_NODE
#define APP_DOORS_PER_NODE 8
#endif

#define APP_MAX_DOORS (APP_MAX_NODES * APP_DOORS_PER_NODE) /* 80 */

/* Возвращает 1..80 или 0 если вход некорректный */
static inline uint8_t GlobalDoorId_Make(uint8_t nodeId, uint8_t localDoor)
{
    if (nodeId < 1U || nodeId > APP_MAX_NODES) return 0U;
    if (localDoor < 1U || localDoor > APP_DOORS_PER_NODE) return 0U;
    return (uint8_t)(((nodeId - 1U) * APP_DOORS_PER_NODE) + localDoor);
}

/* Из globalDoorId 1..80 получить nodeId 1..10. Если invalid -> 0 */
static inline uint8_t GlobalDoorId_Node(uint8_t globalDoorId)
{
    if (globalDoorId < 1U || globalDoorId > APP_MAX_DOORS) return 0U;
    return (uint8_t)(((globalDoorId - 1U) / APP_DOORS_PER_NODE) + 1U);
}

/* Из globalDoorId 1..80 получить localDoor 1..8. Если invalid -> 0 */
static inline uint8_t GlobalDoorId_Local(uint8_t globalDoorId)
{
    if (globalDoorId < 1U || globalDoorId > APP_MAX_DOORS) return 0U;
    return (uint8_t)(((globalDoorId - 1U) % APP_DOORS_PER_NODE) + 1U);
}
