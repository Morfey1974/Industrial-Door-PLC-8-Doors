/**
 * event_journal.c — подсистема «журнала» на QSPI: запись событий отключена.
 *
 * Раньше здесь был кольцевой журнал + очередь + отдельная задача JournalTask.
 * По требованию прошивки: не вести журнал, не занимать RAM очередью, не писать
 * события во флэш. Сохраняем только:
 * - EventJournal_Init() — инициализация блокировки QSPI и статистики;
 * - EventJournal_EraseAll() — стирание выделенной области под старый журнал при
 *   полной очистке flash (POST /api/flash/clear и аналоги), чтобы не оставлять
 *   устаревшие данные в разделе.
 *
 * С прошивки сняты HTTP-маршруты журнала (префикс /api/journal); UI не запрашивает.
 */

#include "event_journal.h"

#include <string.h>

#include "app_log.h"
#include "config/config_format.h"
#include "config/config_layout.h"
#include "qspi_bringup.h"
#include "system/app_qspi_lock.h"

#include "FreeRTOS.h"
#include "projdefs.h"

#define ELOG_SECTOR_MAGIC (0x454C4F47u) /* 'ELOG' */

typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint32_t sectorSeq;
    uint32_t hdrCrc32;
    uint32_t rsvd;
} elog_sector_hdr_t;

static uint8_t s_ready;
static journal_stats_t s_stats;

static uint32_t sector_count(void)
{
    return (QSPI_EVENT_LOG_SIZE / QSPI_SECTOR_SIZE);
}

static uint32_t sector_base(uint32_t sector_index)
{
    return (uint32_t)(QSPI_EVENT_LOG_BASE + (sector_index * QSPI_SECTOR_SIZE));
}

static uint32_t crc32_buf(const void *data, size_t len)
{
    return Config_CalcCrc32(data, len);
}

static HAL_StatusTypeDef flash_erase_sector(uint32_t addr)
{
    return QSPI_Flash_Erase4K(addr);
}

static HAL_StatusTypeDef flash_prog(uint32_t addr, const void *buf, uint32_t len)
{
    return QSPI_Flash_ProgramPage(addr, (const uint8_t *)buf, len);
}

static HAL_StatusTypeDef sector_write_header(uint32_t sector_index, uint32_t sector_seq)
{
    elog_sector_hdr_t h;
    memset(&h, 0xFF, sizeof(h));
    h.magic = ELOG_SECTOR_MAGIC;
    h.sectorSeq = sector_seq;
    h.hdrCrc32 = 0;
    h.rsvd = 0xFFFFFFFFu;
    h.hdrCrc32 = crc32_buf(&h, sizeof(h));
    return flash_prog(sector_base(sector_index), &h, sizeof(h));
}

void EventJournal_Init(void)
{
    AppQspiLock_Init();
    memset(&s_stats, 0, sizeof(s_stats));
    s_stats.base = QSPI_EVENT_LOG_BASE;
    s_stats.size = QSPI_EVENT_LOG_SIZE;
    s_stats.sector_size = QSPI_SECTOR_SIZE;
    s_stats.sectors = sector_count();
    s_ready = 1U;
}

journal_status_t EventJournal_EnqueueEvent(const app_event_t *evt)
{
    (void)evt;
    return JOURNAL_OK;
}

void EventJournal_LogConfigAction(uint32_t action_id, uint32_t cfg_seq, uint32_t user_id, uint32_t result)
{
    (void)action_id;
    (void)cfg_seq;
    (void)user_id;
    (void)result;
}

void EventJournal_LogUserAction(uint32_t action_id, const char *username, uint32_t client_unix_sec, uint32_t result)
{
    (void)action_id;
    (void)username;
    (void)client_unix_sec;
    (void)result;
}

journal_status_t EventJournal_EraseAll(void)
{
    if (!s_ready)
        return JOURNAL_NOT_INIT;

    AppQspiLock_Lock();
    const uint32_t scnt = sector_count();
    for (uint32_t i = 0; i < scnt; i++)
    {
        if (flash_erase_sector(sector_base(i)) != HAL_OK)
        {
            s_stats.io_errors++;
            AppQspiLock_Unlock();
            return JOURNAL_IO_ERROR;
        }
    }
    if (sector_write_header(0, 1U) != HAL_OK)
    {
        AppQspiLock_Unlock();
        return JOURNAL_IO_ERROR;
    }
    s_stats.total_records = 0U;
    s_stats.records_written = 0U;
    AppQspiLock_Unlock();
    return JOURNAL_OK;
}

void EventJournal_GetStats(journal_stats_t *out)
{
    if (!out)
        return;
    memset(out, 0, sizeof(*out));
    out->base = QSPI_EVENT_LOG_BASE;
    out->size = QSPI_EVENT_LOG_SIZE;
    out->sector_size = QSPI_SECTOR_SIZE;
    out->sectors = sector_count();
    if (s_ready)
    {
        out->io_errors = s_stats.io_errors;
        out->dropped_queue = 0U;
        out->total_records = 0U;
        out->records_written = 0U;
    }
}

BaseType_t EventJournal_WaitEvent(app_event_t *out_evt, TickType_t ticks_to_wait)
{
    (void)out_evt;
    (void)ticks_to_wait;
    return pdFALSE;
}

void EventJournal_WriteEventToFlash(const app_event_t *evt)
{
    (void)evt;
}

journal_status_t EventJournal_ReadRecords(uint32_t offset, uint32_t limit,
                                        journal_record_t *out_records,
                                        uint32_t *out_count)
{
    (void)offset;
    (void)limit;
    (void)out_records;
    if (!out_count)
        return JOURNAL_NOT_INIT;
    *out_count = 0U;
    return s_ready ? JOURNAL_OK : JOURNAL_NOT_INIT;
}

void EventJournal_PrintStats(void)
{
    AppLog("JOURNAL: запись отключена; область 0x%08lx, %lu байт (стирается при полной очистке flash)",
           (unsigned long)QSPI_EVENT_LOG_BASE,
           (unsigned long)QSPI_EVENT_LOG_SIZE);
}

journal_status_t EventJournal_Clear(void)
{
    return EventJournal_EraseAll();
}

void EventJournal_DumpLast(uint32_t count)
{
    (void)count;
    AppLog("JOURNAL: дамп недоступен — журнал отключён");
}

void EventJournal_PrintDetailedInfo(void)
{
    EventJournal_PrintStats();
}

void EventJournal_PrintRecordInfo(void)
{
    EventJournal_PrintStats();
}
