#pragma once

/* =========================================================
 * ЭТАП 7 (MASTER-only): Разметка QSPI Flash
 *
 * Микросхема: Winbond W25Q128JV (128 Mbit = 16 MiB)
 * Диапазон адресов: 0x000000 .. 0xFFFFFF (24-bit)
 *
 * Принципы:
 *  - Конфиг пишется редко -> 2 слота по 64 KiB (атомарная смена).
 *  - Журнал пишется часто -> отдельная область под кольцевой буфер.
 *  - Используем верхнюю часть Flash, чтобы не мешать
 *    возможным будущим сценариям (XIP, ресурсы, дампы).
 *
 * Карта (все области разделены, не пересекаются):
 *  0x000000 .. 0xF5EFFF   Резерв / не используется модулем хранения
 *  0xF5F000 .. 0xF5FFFF   MAPPING (4 KiB)       [карта маппинга редактора схем]
 *  0xF60000 .. 0xF7FFFF   USERS DB (128 KiB)    [Этап Auth]
 *  0xF80000 .. 0xFDFFFF   EVENT LOG (512 KiB)   [Этап 7B]
 *  0xFE0000 .. 0xFEFFFF   CONFIG SLOT A (64 KiB) [рабочая конфигурация дверей]
 *  0xFF0000 .. 0xFFFFFF   CONFIG SLOT B (64 KiB)
 * ========================================================= */

#include <stdint.h>

/*
 * QSPI layout for project configuration storage.
 *
 * Two slots (A/B) for atomic activation (A/B swap).
 * Each slot contains:
 *   - cfg_slot_header_t (fixed header, includes CRC of header and payload)
 *   - project_config_t payload (serialized as raw struct)
 */

/* Slot header magic ("IDCF") */
#define CFG_SLOT_MAGIC (0x49444346u)

typedef struct
{
    uint32_t magic;
    uint32_t seq;
    /* 32-bit to match CFG_FORMAT_VERSION (0x00010001) */
    uint32_t formatVersion;
    uint32_t payloadLen;
    uint32_t payloadCrc32;
    uint32_t headerCrc32;
} cfg_slot_header_t;

/* Геометрия флеша (W25Q128): */
#define QSPI_FLASH_SIZE_BYTES      (16U * 1024U * 1024U)
#define QSPI_FLASH_ADDR_MIN        0x000000UL
#define QSPI_FLASH_ADDR_MAX        0xFFFFFFUL

#define QSPI_SECTOR_SIZE           4096U
#define QSPI_PAGE_SIZE             256U

/* Область базы данных пользователей: */
#define QSPI_USERS_DB_BASE         0xF60000UL
#define QSPI_USERS_DB_SIZE         (128U * 1024U)

/* Область карты маппинга (редактор схем): 4 KiB, один сектор.
 * Отдельная «полка» от конфигурации (CONFIG SLOT A/B) и от USERS/EVENT_LOG. */
#define QSPI_MAPPING_BASE          0xF5F000UL
#define QSPI_MAPPING_SIZE          (4U * 1024U)

/* Область журнала событий (добавим в Этапе 7B): */
#define QSPI_EVENT_LOG_BASE        0xF80000UL
#define QSPI_EVENT_LOG_SIZE        (512U * 1024U)

/* Область конфигурации (двери, зависимости, таймауты): отдельная от MAPPING. */
#define QSPI_CFG_SLOT_SIZE         (64U * 1024U)
#define QSPI_CFG_SLOT_A_BASE       0xFE0000UL
#define QSPI_CFG_SLOT_B_BASE       0xFF0000UL

/* Внутри слота используем смещение для payload, а header пишем последним
 * (чтобы обеспечить атомарность при power-loss).
 */
#define QSPI_CFG_HEADER_OFFSET     0x0000UL
#define QSPI_CFG_PAYLOAD_OFFSET    0x0100UL /* 256 байт: выравнивание по странице */

/* Максимальный размер payload в пределах слота */
#define QSPI_CFG_MAX_PAYLOAD       (QSPI_CFG_SLOT_SIZE - QSPI_CFG_PAYLOAD_OFFSET)

/* Проверка на этапе компиляции: конфигурация и карта маппинга не пересекаются. */
#define QSPI_MAPPING_END           (QSPI_MAPPING_BASE + QSPI_MAPPING_SIZE)
_Static_assert(QSPI_MAPPING_END <= QSPI_CFG_SLOT_A_BASE,
               "QSPI: MAPPING must end before CONFIG SLOT A");
