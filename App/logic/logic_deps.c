#include "logic_deps.h"

/* ============================================================
 * Bitset layout:
 *  globalDoorId: 1..80
 *  bit_index = globalDoorId - 1 (0-based)
 *  word = bit_index / 64
 *  bit  = bit_index % 64
 * ============================================================ */

static uint8_t bitpos(uint8_t globalDoorId, uint8_t *outWord, uint8_t *outBit)
{
    if (globalDoorId < 1U || globalDoorId > APP_MAX_DOORS) return 0U;
    uint8_t idx = (uint8_t)(globalDoorId - 1U);
    *outWord = (uint8_t)(idx >> 6);        /* /64 */
    *outBit  = (uint8_t)(idx & 63U);       /* %64 */
    return 1U;
}

void DoorBitset_Clear(door_bitset_t *bs)
{
    if (!bs) return;
    bs->w[0] = 0ULL;
    bs->w[1] = 0ULL;
}

uint8_t DoorBitset_Set(door_bitset_t *bs, uint8_t globalDoorId, uint8_t on)
{
    if (!bs) return 0U;

    uint8_t word, bit;
    if (!bitpos(globalDoorId, &word, &bit)) return 0U;

    uint64_t mask = (1ULL << bit);
    if (on) bs->w[word] |= mask;
    else    bs->w[word] &= ~mask;

    return 1U;
}

uint8_t DoorBitset_Test(const door_bitset_t *bs, uint8_t globalDoorId)
{
    if (!bs) return 0U;

    uint8_t word, bit;
    if (!bitpos(globalDoorId, &word, &bit)) return 0U;

    uint64_t mask = (1ULL << bit);
    return (bs->w[word] & mask) ? 1U : 0U;
}

void DoorBitset_Or(door_bitset_t *dst, const door_bitset_t *src)
{
    if (!dst || !src) return;
    dst->w[0] |= src->w[0];
    dst->w[1] |= src->w[1];
}

void DoorBitset_And(door_bitset_t *dst, const door_bitset_t *src)
{
    if (!dst || !src) return;
    dst->w[0] &= src->w[0];
    dst->w[1] &= src->w[1];
}

void DoorBitset_AndNot(door_bitset_t *dst, const door_bitset_t *src)
{
    if (!dst || !src) return;
    dst->w[0] &= ~src->w[0];
    dst->w[1] &= ~src->w[1];
}

void LogicDeps_Init(logic_deps_t *ld)
{
    if (!ld) return;
    for (uint8_t i = 0; i < APP_MAX_DOORS; i++)
        DoorBitset_Clear(&ld->deps[i]);
}

uint8_t LogicDeps_ClearForSrc(logic_deps_t *ld, uint8_t srcGlobalDoorId)
{
    if (!ld) return 0U;
    if (srcGlobalDoorId < 1U || srcGlobalDoorId > APP_MAX_DOORS) return 0U;

    DoorBitset_Clear(&ld->deps[srcGlobalDoorId - 1U]);
    return 1U;
}

uint8_t LogicDeps_AddEdge(logic_deps_t *ld, uint8_t srcGlobalDoorId, uint8_t dstGlobalDoorId)
{
    if (!ld) return 0U;
    if (srcGlobalDoorId < 1U || srcGlobalDoorId > APP_MAX_DOORS) return 0U;
    if (dstGlobalDoorId < 1U || dstGlobalDoorId > APP_MAX_DOORS) return 0U;

    /* Самоблокировка бессмысленна — игнорируем */
    if (srcGlobalDoorId == dstGlobalDoorId) return 1U;

    return DoorBitset_Set(&ld->deps[srcGlobalDoorId - 1U], dstGlobalDoorId, 1U);
}

uint8_t LogicDeps_RemoveEdge(logic_deps_t *ld, uint8_t srcGlobalDoorId, uint8_t dstGlobalDoorId)
{
    if (!ld) return 0U;
    if (srcGlobalDoorId < 1U || srcGlobalDoorId > APP_MAX_DOORS) return 0U;
    if (dstGlobalDoorId < 1U || dstGlobalDoorId > APP_MAX_DOORS) return 0U;

    return DoorBitset_Set(&ld->deps[srcGlobalDoorId - 1U], dstGlobalDoorId, 0U);
}

const door_bitset_t* LogicDeps_GetTargets(const logic_deps_t *ld, uint8_t srcGlobalDoorId)
{
    if (!ld) return 0;
    if (srcGlobalDoorId < 1U || srcGlobalDoorId > APP_MAX_DOORS) return 0;
    return &ld->deps[srcGlobalDoorId - 1U];
}
