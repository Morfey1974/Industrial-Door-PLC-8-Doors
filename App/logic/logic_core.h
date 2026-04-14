#pragma once

#include <stdint.h>
#include "system/app_events.h"
#include "logic/logic_deps.h"

/* ============================================================
 * LogicCore — зависимости дверей и целевая блокировка (глобальные ID 1..80).
 *
 * Назначение:
 *  - снимок состояния дверей (глобально);
 *  - модель зависимостей (deps);
 *  - lockRequired и команды в DoorTask для локальных дверей.
 *
 * LogicCore не дёргает GPIO напрямую — только Doors_RequestLock и т.п.
 * ============================================================ */

typedef struct logic_core_t
{
    logic_deps_t deps;

    /* --- snapshot: физическое состояние дверей (глобально) --- */
    uint8_t physOpen[APP_MAX_DOORS]; /* 1 если дверь физически OPEN */

    /* --- Сигнализация (резерв под внешний снимок; в одноплатной сборке из шины не заполняется) --- */
    uint32_t remoteAlarmReasons[APP_MAX_DOORS];

    /* --- «post-close delay» для эффекта двери в зависимостях --- */
    uint8_t depActive[APP_MAX_DOORS];
    uint8_t closePending[APP_MAX_DOORS];

    /* --- Post-close delay для целевых дверей --- */
    uint8_t targetUnlockPending[APP_MAX_DOORS];
    uint32_t targetUnlockStartMs[APP_MAX_DOORS];

    door_bitset_t lockRequired;
} logic_core_t;

void LogicCore_Init(logic_core_t *lc);

void LogicCore_OnEvent(logic_core_t *lc, const app_event_t *evt);

/* Обновление снимка по узлу (резерв; при отсутствии CAN не вызывается). */
void LogicCore_OnCanStatus(logic_core_t *lc, uint8_t nodeId,
                           uint8_t presentMask,
                           uint8_t physClosedMask,
                           uint8_t alarmActiveMask,
                           uint8_t signalingActiveMask,
                           uint8_t lockOutputActiveMask);

void LogicCore_RecomputeAndApply(logic_core_t *lc);

uint8_t LogicCore_IsLockRequired(logic_core_t *lc, uint8_t globalDoorId);

/* Ручная LOCK/UNLOCK с учётом приоритетов; локальные двери 1..8. */
uint8_t LogicCore_SubmitManualLockCmd(logic_core_t *lc,
                                     uint8_t localDoorId,
                                     uint8_t lock_on,
                                     uint32_t source,
                                     uint32_t ttl_ms);
