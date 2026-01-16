#pragma once
#include <stdint.h>
#include <stddef.h>
#include "global_door_id.h"

/* ============================================================
 * LogicDeps — модель зависимостей дверей (ЭТАП 5.1)
 *
 * Требование 2.3.7 / 2.4.4:
 *  Для каждой двери-источника задаётся список дверей-целей, которые должны быть
 *  заблокированы при физическом открытии источника.
 *
 * Важно:
 *  - зависимости глобальные, между платами (nodeId+localDoor), поэтому опираемся
 *    на GlobalDoorId 1..80
 *  - список может быть любым (в пределах 80), поэтому внутреннее представление
 *    должно быть эффективно для OR/AND (быстрый пересчёт)
 *
 * Представление:
 *   deps[src] = bitset targets (все двери, которые блокируются, если src OPEN)
 *
 * Где используется:
 *  - Master (Logic Core) держит активную конфигурацию в RAM.
 *  - Конфиг из WEB/FLASH может быть списками, но при активации конфигурации мы
 *    вызываем LogicDeps_AddEdge() на каждую пару src->dst и строим битсеты.
 * ============================================================ */

/* 80 бит удобно хранить как 2x uint64_t (128 бит с запасом).
 * Это даёт быстрые операции OR/AND.
 */
typedef struct
{
    uint64_t w[2]; /* w[0] = bits 1..64, w[1] = bits 65..128 */
} door_bitset_t;

typedef struct
{
    /* deps[src-1] хранит битсет целей для src (src=1..80) */
    door_bitset_t deps[APP_MAX_DOORS];
} logic_deps_t;

/* ---------- Bitset helpers ---------- */

/* Очистить битсет */
void DoorBitset_Clear(door_bitset_t *bs);

/* Установить/снять бит для globalDoorId (1..80). return 1 ok */
uint8_t DoorBitset_Set(door_bitset_t *bs, uint8_t globalDoorId, uint8_t on);

/* Проверить бит globalDoorId (1..80). return 1 если бит=1 */
uint8_t DoorBitset_Test(const door_bitset_t *bs, uint8_t globalDoorId);

/* dst |= src */
void DoorBitset_Or(door_bitset_t *dst, const door_bitset_t *src);

/* dst &= src */
void DoorBitset_And(door_bitset_t *dst, const door_bitset_t *src);

/* dst &= ~src */
void DoorBitset_AndNot(door_bitset_t *dst, const door_bitset_t *src);

/* ---------- Deps model ---------- */

/* Инициализация/сброс модели зависимостей */
void LogicDeps_Init(logic_deps_t *ld);

/* Удалить все зависимости для одной двери-источника src */
uint8_t LogicDeps_ClearForSrc(logic_deps_t *ld, uint8_t srcGlobalDoorId);

/* Добавить зависимость src -> dst.
 * Игнорируем src==dst (самоблокировка) и invalid ids.
 */
uint8_t LogicDeps_AddEdge(logic_deps_t *ld, uint8_t srcGlobalDoorId, uint8_t dstGlobalDoorId);

/* Удалить зависимость src -> dst */
uint8_t LogicDeps_RemoveEdge(logic_deps_t *ld, uint8_t srcGlobalDoorId, uint8_t dstGlobalDoorId);

/* Получить битсет целей для src (указатель на внутренние данные, read-only) */
const door_bitset_t* LogicDeps_GetTargets(const logic_deps_t *ld, uint8_t srcGlobalDoorId);
