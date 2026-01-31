#include "config_format.h"

#include <stdio.h>
#include <string.h>

/* =========================================================
 * CRC32 (software)
 * Полином reflected: 0xEDB88320 (standard CRC-32)
 * ========================================================= */
static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t len)
{
    crc ^= 0xFFFFFFFFU;
    for (size_t i = 0; i < len; i++)
    {
        crc ^= (uint32_t)data[i];
        for (uint8_t b = 0; b < 8; b++)
        {
            uint32_t mask = (uint32_t)-(int32_t)(crc & 1U);
            crc = (crc >> 1) ^ (0xEDB88320U & mask);
        }
    }
    return crc ^ 0xFFFFFFFFU;
}

uint32_t Config_CalcCrc32(const void *data, size_t len)
{
    if (!data || len == 0U)
        return 0U;
    return crc32_update(0U, (const uint8_t *)data, len);
}

uint8_t Config_MakeGlobalDoorId(uint8_t nodeId, uint8_t localDoor)
{
    if (nodeId < 1U || nodeId > CFG_MAX_NODES) return 0U;
    if (localDoor < 1U || localDoor > CFG_DOORS_PER_NODE) return 0U;
    /* 1..80 */
    return (uint8_t)(((nodeId - 1U) * CFG_DOORS_PER_NODE) + localDoor);
}

void Config_Default(project_config_t *cfg)
{
    if (!cfg) return;

    memset(cfg, 0, sizeof(*cfg));

    cfg->formatVersion = CFG_FORMAT_VERSION;
    cfg->seq = 1U;

    /* Тайм-ауты по плану */
    cfg->openTimeoutMs = 30U * 1000U; /* 30 сек */
    for (uint16_t i = 0; i < CFG_MAX_DOORS; i++)
        cfg->postCloseTimeoutMs[i] = 500U; /* 0.5 сек */

    /* Двери по умолчанию: 8 дверей на MASTER (node=1) */
    cfg->doorCount = 8U;
    for (uint8_t i = 0; i < cfg->doorCount; i++)
    {
        cfg_door_t *d = &cfg->doors[i];
        d->nodeId = 1U;
        d->localDoor = (uint8_t)(i + 1U);
        d->type = (uint8_t)DOOR_TYPE_NC;
        d->techId = (uint16_t)(i + 1U);
        d->drawingId = (uint16_t)(i + 1U);
        memset(d->comment, 0, sizeof(d->comment));
    }

    /* Зависимости по умолчанию: пусто */
    cfg->edgeCount = 0U;

    /* Сеть (служебно) */
    cfg->net.dhcpEnabled = 1U;
    cfg->net.webPort = 80U;
    cfg->net.canOfflineTimeoutMs = 1500U;
    cfg->net.canBitrate = 500000U;
    cfg->net.ip[0] = 192U; cfg->net.ip[1] = 168U; cfg->net.ip[2] = 1U; cfg->net.ip[3] = 50U;
    cfg->net.netmask[0] = 255U; cfg->net.netmask[1] = 255U; cfg->net.netmask[2] = 255U; cfg->net.netmask[3] = 0U;
    cfg->net.gw[0] = 192U; cfg->net.gw[1] = 168U; cfg->net.gw[2] = 1U; cfg->net.gw[3] = 1U;
}

static void set_err(cfg_validate_error_t *err, const char *msg)
{
    if (!err) return;
    if (!msg) { err->text[0] = '\0'; return; }
    (void)snprintf(err->text, sizeof(err->text), "%s", msg);
}

static uint8_t validate_ranges(const project_config_t *cfg, cfg_validate_error_t *err)
{
    if (cfg->doorCount > CFG_MAX_DOORS)
    {
        set_err(err, "doorCount exceeds limit");
        return CFG_VALIDATE_BAD;
    }
    if (cfg->edgeCount > CFG_MAX_EDGES)
    {
        set_err(err, "edgeCount exceeds limit");
        return CFG_VALIDATE_BAD;
    }
    /* 0 = отключена автосигнализация по таймауту (только кнопка Alarm) */
    if (cfg->openTimeoutMs != 0U &&
        (cfg->openTimeoutMs < 100U || cfg->openTimeoutMs > (10U * 60U * 1000U)))
    {
        set_err(err, "openTimeoutMs out of range");
        return CFG_VALIDATE_BAD;
    }
    return CFG_VALIDATE_OK;
}

static uint8_t validate_doors_unique(const project_config_t *cfg, cfg_validate_error_t *err)
{
    /* уникальность techId и globalDoorId */
    for (uint16_t i = 0; i < cfg->doorCount; i++)
    {
        const cfg_door_t *a = &cfg->doors[i];

        if (a->nodeId < 1U || a->nodeId > CFG_MAX_NODES)
        {
            set_err(err, "door.nodeId out of range");
            return CFG_VALIDATE_BAD;
        }
        if (a->localDoor < 1U || a->localDoor > CFG_DOORS_PER_NODE)
        {
            set_err(err, "door.localDoor out of range");
            return CFG_VALIDATE_BAD;
        }

        const uint8_t a_gid = Config_MakeGlobalDoorId(a->nodeId, a->localDoor);
        for (uint16_t j = (uint16_t)(i + 1U); j < cfg->doorCount; j++)
        {
            const cfg_door_t *b = &cfg->doors[j];

            if (a->techId != 0U && (a->techId == b->techId))
            {
                set_err(err, "techId must be unique");
                return CFG_VALIDATE_BAD;
            }

            const uint8_t b_gid = Config_MakeGlobalDoorId(b->nodeId, b->localDoor);
            if (a_gid != 0U && (a_gid == b_gid))
            {
                set_err(err, "globalDoorId must be unique");
                return CFG_VALIDATE_BAD;
            }
        }
    }
    return CFG_VALIDATE_OK;
}

static uint8_t validate_edges(const project_config_t *cfg, cfg_validate_error_t *err)
{
    for (uint16_t i = 0; i < cfg->edgeCount; i++)
    {
        const cfg_edge_t *e = &cfg->edges[i];
        if (e->srcGlobalDoorId < 1U || e->srcGlobalDoorId > CFG_MAX_DOORS)
        {
            set_err(err, "edge.srcGlobalDoorId out of range");
            return CFG_VALIDATE_BAD;
        }
        if (e->dstGlobalDoorId < 1U || e->dstGlobalDoorId > CFG_MAX_DOORS)
        {
            set_err(err, "edge.dstGlobalDoorId out of range");
            return CFG_VALIDATE_BAD;
        }
        if (e->srcGlobalDoorId == e->dstGlobalDoorId)
        {
            set_err(err, "edge src==dst not allowed");
            return CFG_VALIDATE_BAD;
        }
    }
    return CFG_VALIDATE_OK;
}

uint8_t Config_Validate(const project_config_t *cfg, cfg_validate_error_t *err)
{
    if (!cfg)
    {
        set_err(err, "cfg is NULL");
        return CFG_VALIDATE_BAD;
    }
    if (cfg->formatVersion != CFG_FORMAT_VERSION)
    {
        set_err(err, "formatVersion mismatch");
        return CFG_VALIDATE_BAD;
    }

    if (validate_ranges(cfg, err) != CFG_VALIDATE_OK) return CFG_VALIDATE_BAD;
    if (validate_doors_unique(cfg, err) != CFG_VALIDATE_OK) return CFG_VALIDATE_BAD;
    if (validate_edges(cfg, err) != CFG_VALIDATE_OK) return CFG_VALIDATE_BAD;

    for (uint16_t i = 0; i < CFG_MAX_DOORS; i++)
    {
        const uint32_t t = cfg->postCloseTimeoutMs[i];
        if (t > 60U * 1000U)
        {
            set_err(err, "postCloseTimeoutMs out of range");
            return CFG_VALIDATE_BAD;
        }
    }

    set_err(err, NULL);
    return CFG_VALIDATE_OK;
}

void Config_Finalize(project_config_t *cfg)
{
    /* Сейчас CRC хранится в слоте (payloadCrc32), поэтому тут оставляем хук
     * под будущие расширения (нормализация строк, пересчет derived-полей, и т.п.)
     */
    (void)cfg;
}
