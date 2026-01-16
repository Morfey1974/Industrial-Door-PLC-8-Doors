#pragma once

#include <stdint.h>
#include "system/app_events.h"
#include "logic/logic_deps.h"

/* ============================================================
 * LogicCore (ЭТАП 5.2–5.4, Master-only, nodeId=1)
 *
 * Назначение:
 *  - хранит снимок состояния дверей (глобально 1..80)
 *  - применяет модель зависимостей (deps)
 *  - формирует целевое состояние блокировки
 *  - выдаёт команды дверям:
 *      * локально (nodeId=1): Doors_RequestLock()
 *      * удалённо (nodeId!=1): пока заглушка (этап 6)
 *
 * ВАЖНО:
 *  - LogicCore НЕ управляет аппаратурой напрямую.
 *  - Он работает только через “модель двери” (Doors_RequestLock)
 *  - Вход = события EventBus + snapshot из Doors_GetState (для локальных дверей)
 * ============================================================ */

typedef struct logic_core_t
{
    logic_deps_t deps;

    /* --- snapshot: физическое состояние дверей (глобально) --- */
    uint8_t physOpen[APP_MAX_DOORS]; /* 1 если дверь физически OPEN */

    /* --- 2.4.6: “post-close delay” для эффекта двери в зависимостях ---
     *
     * Интерпретация по ТЗ:
     *  - если дверь открыта -> её зависимости активны немедленно
     *  - если дверь закрылась -> эффект зависимостей НЕ снимается сразу,
     *    а снимается только когда придёт EVT_DOOR_POST_CLOSE_READY для этой двери.
     *
     * Это даёт детерминированность и устраняет “дребезг” логики при быстром открытии/закрытии.
     */
    uint8_t depActive[APP_MAX_DOORS];      /* 1 если зависимости этой двери учитываются */
    uint8_t closePending[APP_MAX_DOORS];   /* 1 если ждём POST_CLOSE_READY после CLOSE */

    /* --- вычисленный результат --- */
    door_bitset_t lockRequired; /* глобальная маска дверей, которые ТРЕБУЕТСЯ блокировать */
} logic_core_t;

/* Init + (опционально) заполнить тестовую таблицу зависимостей */
void LogicCore_Init(logic_core_t *lc);

/* Подать событие из EventBus в LogicCore */
void LogicCore_OnEvent(logic_core_t *lc, const app_event_t *evt);

/* ============================================================
 * ЭТАП 6.4: обновление snapshot от SLAVE (STATUS кадры)
 *
 * Master принимает состояние 8 дверей SLAVE в виде битовых масок.
 * LogicCore обновляет глобальный снимок:
 *   - physOpen[...] и depActive[...] для соответствующих globalDoorId.
 *
 * В Этапе 6 мы...
 * ============================================================ */
void LogicCore_OnCanStatus(logic_core_t *lc, uint8_t nodeId,
                           uint8_t presentMask,
                           uint8_t physClosedMask,
                           uint8_t alarmActiveMask,
                           uint8_t signalingActiveMask,
                           uint8_t lockOutputActiveMask);

/* Принудительно пересчитать и применить (можно дергать после конфиг-активации) */
void LogicCore_RecomputeAndApply(logic_core_t *lc);

/* ============================================================
 * Ручная команда LOCK/UNLOCK (ЭТАП 5.5: разрешение конфликтов)
 *
 * Команды от внешних интерфейсов (HTTP/RS-485/CAN/LOCAL) должны
 * проходить через LogicCore, чтобы:
 *  - оставаться в рамках инвариантов DoorTask (безопасность)
 *  - иметь единый вход для будущих правил приоритетов
 *
 * Сейчас (Standalone) команда применяется только к локальным дверям MASTER
 * (door_id 1..8). Удалённые двери будут обрабатываться через CAN (ЭТАП 6).
 *
 * return: 1 если команда принята и передана в DoorTask, иначе 0.
 * ============================================================ */
uint8_t LogicCore_SubmitManualLockCmd(logic_core_t *lc,
                                     uint8_t localDoorId,
                                     uint8_t lock_on,
                                     uint32_t source,
                                     uint32_t ttl_ms);
