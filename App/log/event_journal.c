#include "event_journal.h"

#include <string.h>

/* AppLog(): печать в UART3 через LoggerTask. */
#include "app_log.h"

#include "config/config_format.h" /* Config_CalcCrc32 */
#include "qspi_bringup.h"
#include "system/app_qspi_lock.h"
#include "system/rtc_service.h"

/* ---------------- Flash format ---------------- */

#define ELOG_SECTOR_MAGIC   (0x454C4F47u) /* 'ELOG' */
#define ELOG_REC_MAGIC      (0x45565430u) /* 'EVT0' */
#define ELOG_REC_MAGIC_V2   (0x45565431u) /* 'EVT1' — запись с именем пользователя (48 байт) */

#define ELOG_SECTOR_HDR_BYTES 256U /* keep first page for header */
#define ELOG_RECORD_V2_USERNAME_LEN 16U

typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint32_t sectorSeq;
    uint32_t hdrCrc32;
    uint32_t rsvd;
} elog_sector_hdr_t;

/* 32 bytes, aligned-friendly (8 records per 256B page) */
typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint32_t recSeq;
    uint32_t timestamp;
    uint16_t type;
    uint16_t source;
    uint8_t  door_id;
    uint8_t  flags;
    uint16_t rsvd16;
    uint32_t arg;
    uint32_t crc32;
    uint32_t pad;
} elog_record_t;

/* 48 bytes: расширенная запись с именем пользователя (действия из UI, время с ПК) */
typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint32_t recSeq;
    uint32_t timestamp;
    uint16_t type;
    uint16_t source;
    uint8_t  door_id;
    uint8_t  flags;
    uint16_t rsvd16;
    uint32_t arg;
    char     username[ELOG_RECORD_V2_USERNAME_LEN];
    uint32_t crc32;
    uint32_t pad;
} elog_record_v2_t;

enum { elog_record_t_must_be_32_bytes = 1 / ((sizeof(elog_record_t) == 32) ? 1 : 0) };
enum { elog_record_v2_t_must_be_48_bytes = 1 / ((sizeof(elog_record_v2_t) == 48) ? 1 : 0) };

/* ---------------- State ---------------- */

static QueueHandle_t s_q = NULL;
static uint32_t s_cur_sector = 0;
static uint32_t s_cur_sector_seq = 0;
static uint32_t s_cur_write_ofs = ELOG_SECTOR_HDR_BYTES;
static uint32_t s_next_rec_seq = 1;

static journal_stats_t s_stats;

/* ---------------- Helpers ---------------- */

static uint32_t sector_count(void)
{
    return (QSPI_EVENT_LOG_SIZE / QSPI_SECTOR_SIZE);
}

static uint32_t sector_base(uint32_t sector_index)
{
    return (uint32_t)(QSPI_EVENT_LOG_BASE + (sector_index * QSPI_SECTOR_SIZE));
}

static HAL_StatusTypeDef flash_read(uint32_t addr, void *buf, uint32_t len)
{
    return QSPI_Flash_Read(addr, (uint8_t*)buf, len);
}

static HAL_StatusTypeDef flash_erase_sector(uint32_t addr)
{
    return QSPI_Flash_Erase4K(addr);
}

static HAL_StatusTypeDef flash_prog(uint32_t addr, const void *buf, uint32_t len)
{
    /* ProgramPage supports <=256 bytes. Here we always keep writes within a page. */
    return QSPI_Flash_ProgramPage(addr, (const uint8_t*)buf, len);
}

/* Запись произвольного блока с безопасным разбиением по границам страниц QSPI.
 * Почему это важно:
 * - После введения двух форматов записей (32 и 48 байт) смещения в секторе
 *   перестали быть кратны 32 и иногда попадают на конец страницы.
 * - Одна операция ProgramPage, пересекающая границу 256-байтной страницы,
 *   может завершаться ошибкой и "замораживать" журнал на одном смещении.
 * Решение:
 * - Разбиваем запись на несколько ProgramPage-операций так, чтобы каждый кусок
 *   полностью лежал в пределах одной страницы.
 */
static HAL_StatusTypeDef flash_prog_split_pages(uint32_t addr, const void *buf, uint32_t len)
{
    const uint8_t *p = (const uint8_t*)buf;
    uint32_t left = len;
    uint32_t cur = addr;

    while (left > 0U)
    {
        uint32_t page_ofs = cur % QSPI_PAGE_SIZE;
        uint32_t room = QSPI_PAGE_SIZE - page_ofs;
        uint32_t chunk = (left < room) ? left : room;

        if (QSPI_Flash_ProgramPage(cur, p, chunk) != HAL_OK)
            return HAL_ERROR;

        cur += chunk;
        p += chunk;
        left -= chunk;
    }
    return HAL_OK;
}

static uint32_t crc32_buf(const void *data, size_t len)
{
    return Config_CalcCrc32(data, len);
}

static int sector_hdr_is_valid(const elog_sector_hdr_t *h)
{
    if (h->magic != ELOG_SECTOR_MAGIC) return 0;
    elog_sector_hdr_t tmp = *h;
    tmp.hdrCrc32 = 0;
    const uint32_t c = crc32_buf(&tmp, sizeof(tmp));
    return (c == h->hdrCrc32) ? 1 : 0;
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

    const uint32_t base = sector_base(sector_index);
    return flash_prog(base, &h, sizeof(h));
}

static HAL_StatusTypeDef read_record_magic(uint32_t abs_addr, uint32_t *out_magic)
{
    return flash_read(abs_addr, out_magic, sizeof(uint32_t));
}

static int record_is_valid(const elog_record_t *r)
{
    if (r->magic != ELOG_REC_MAGIC) return 0;
    elog_record_t tmp = *r;
    tmp.crc32 = 0;
    tmp.pad = 0;
    const uint32_t c = crc32_buf(&tmp, sizeof(tmp));
    return (c == r->crc32) ? 1 : 0;
}

static int record_v2_is_valid(const elog_record_v2_t *r)
{
    if (r->magic != ELOG_REC_MAGIC_V2) return 0;
    elog_record_v2_t tmp = *r;
    tmp.crc32 = 0;
    tmp.pad = 0;
    const uint32_t c = crc32_buf(&tmp, sizeof(tmp));
    return (c == r->crc32) ? 1 : 0;
}

static HAL_StatusTypeDef write_record(uint32_t sector_index, uint32_t write_ofs, const elog_record_t *r)
{
    const uint32_t base = sector_base(sector_index);
    const uint32_t abs = base + write_ofs;
    return flash_prog_split_pages(abs, r, sizeof(*r));
}

static HAL_StatusTypeDef write_record_v2(uint32_t sector_index, uint32_t write_ofs, const elog_record_v2_t *r)
{
    const uint32_t base = sector_base(sector_index);
    const uint32_t abs = base + write_ofs;
    return flash_prog_split_pages(abs, r, sizeof(*r));
}

/* Подсчёт валидных записей в одном секторе (EVT0/EVT1). */
static uint32_t count_valid_records_in_sector(uint32_t sector_index)
{
    const uint32_t base = sector_base(sector_index);
    uint32_t ofs = ELOG_SECTOR_HDR_BYTES;
    uint32_t cnt = 0U;

    while (ofs < QSPI_SECTOR_SIZE)
    {
        uint32_t magic = 0U;
        if (read_record_magic(base + ofs, &magic) != HAL_OK)
            break;
        if (magic == 0xFFFFFFFFu)
            break;

        uint32_t rec_sz = (magic == ELOG_REC_MAGIC) ? sizeof(elog_record_t) :
                          (magic == ELOG_REC_MAGIC_V2) ? sizeof(elog_record_v2_t) : 0U;
        if (rec_sz == 0U || (ofs + rec_sz) > QSPI_SECTOR_SIZE)
            break;

        if (rec_sz == sizeof(elog_record_t))
        {
            elog_record_t r;
            if (flash_read(base + ofs, &r, sizeof(r)) != HAL_OK) break;
            if (!record_is_valid(&r)) break;
        }
        else
        {
            elog_record_v2_t r2;
            if (flash_read(base + ofs, &r2, sizeof(r2)) != HAL_OK) break;
            if (!record_v2_is_valid(&r2)) break;
        }

        cnt++;
        ofs += rec_sz;
    }

    return cnt;
}

/* Текущее количество записей в кольцевом журнале (для UI-пагинации). */
static uint32_t count_total_valid_records(void)
{
    uint32_t total = 0U;
    const uint32_t scnt = sector_count();
    for (uint32_t i = 0; i < scnt; i++)
        total += count_valid_records_in_sector(i);
    return total;
}

/* Размер записи по magic в начале записи: 32 (EVT0) или 48 (EVT1), иначе 0 */
static uint32_t get_record_size_at(uint32_t base, uint32_t ofs)
{
    uint32_t magic = 0;
    if (flash_read(base + ofs, &magic, sizeof(magic)) != HAL_OK)
        return 0;
    if (magic == ELOG_REC_MAGIC) return sizeof(elog_record_t);
    if (magic == ELOG_REC_MAGIC_V2) return sizeof(elog_record_v2_t);
    return 0;
}

/* Смещение и размер предыдущей записи перед ofs (для обхода назад). Возвращает 1 при успехе. */
static int get_prev_record_at(uint32_t base, uint32_t ofs, uint32_t *out_prev_ofs, uint32_t *out_size)
{
    if (ofs < ELOG_SECTOR_HDR_BYTES + sizeof(elog_record_t))
        return 0;
    uint32_t magic = 0;
    if (ofs >= ELOG_SECTOR_HDR_BYTES + 32u &&
        flash_read(base + ofs - 32u, &magic, sizeof(magic)) == HAL_OK &&
        magic == ELOG_REC_MAGIC)
    {
        *out_prev_ofs = ofs - 32u;
        *out_size = 32u;
        return 1;
    }
    if (ofs >= ELOG_SECTOR_HDR_BYTES + 48u &&
        flash_read(base + ofs - 48u, &magic, sizeof(magic)) == HAL_OK &&
        magic == ELOG_REC_MAGIC_V2)
    {
        *out_prev_ofs = ofs - 48u;
        *out_size = 48u;
        return 1;
    }
    return 0;
}

static void scan_find_tail(uint32_t sector_index)
{
    const uint32_t base = sector_base(sector_index);
    uint32_t ofs = ELOG_SECTOR_HDR_BYTES;
    uint32_t last_seq = 0;

    while (ofs < QSPI_SECTOR_SIZE)
    {
        uint32_t magic = 0;
        if (read_record_magic(base + ofs, &magic) != HAL_OK)
        {
            s_stats.io_errors++;
            break;
        }
        if (magic == 0xFFFFFFFFu)
            break;

        uint32_t rec_sz = (magic == ELOG_REC_MAGIC) ? sizeof(elog_record_t) :
                          (magic == ELOG_REC_MAGIC_V2) ? sizeof(elog_record_v2_t) : 0;
        if (rec_sz == 0 || (ofs + rec_sz) > QSPI_SECTOR_SIZE)
            break;

        if (rec_sz == sizeof(elog_record_t))
        {
            elog_record_t r;
            if (flash_read(base + ofs, &r, sizeof(r)) != HAL_OK) { s_stats.io_errors++; break; }
            if (!record_is_valid(&r)) break;
            last_seq = r.recSeq;
        }
        else
        {
            elog_record_v2_t r2;
            if (flash_read(base + ofs, &r2, sizeof(r2)) != HAL_OK) { s_stats.io_errors++; break; }
            if (!record_v2_is_valid(&r2)) break;
            last_seq = r2.recSeq;
        }
        ofs += rec_sz;
    }

    s_cur_write_ofs = ofs;
    if (last_seq > 0) s_next_rec_seq = last_seq + 1U;
}

static void mount_or_format(void)
{
    const uint32_t scnt = sector_count();
    elog_sector_hdr_t h;

    uint32_t best_i = 0;
    uint32_t best_seq = 0;
    int found = 0;

    for (uint32_t i = 0; i < scnt; i++)
    {
        if (flash_read(sector_base(i), &h, sizeof(h)) != HAL_OK)
        {
            s_stats.io_errors++;
            continue;
        }
        if (!sector_hdr_is_valid(&h)) continue;

        if (!found || h.sectorSeq > best_seq)
        {
            found = 1;
            best_seq = h.sectorSeq;
            best_i = i;
        }
    }

    if (!found)
    {
        /* Fresh format: erase first sector, write header seq=1 */
        (void)flash_erase_sector(sector_base(0));
        (void)sector_write_header(0, 1);
        s_cur_sector = 0;
        s_cur_sector_seq = 1;
        s_cur_write_ofs = ELOG_SECTOR_HDR_BYTES;
        s_next_rec_seq = 1;
        return;
    }

    s_cur_sector = best_i;
    s_cur_sector_seq = best_seq;
    scan_find_tail(best_i);
}

static void advance_sector(void)
{
    const uint32_t scnt = sector_count();
    const uint32_t next = (s_cur_sector + 1U) % scnt;

    if (flash_erase_sector(sector_base(next)) != HAL_OK)
    {
        s_stats.io_errors++;
        return;
    }

    const uint32_t new_seq = s_cur_sector_seq + 1U;
    if (sector_write_header(next, new_seq) != HAL_OK)
    {
        s_stats.io_errors++;
        return;
    }

    s_cur_sector = next;
    s_cur_sector_seq = new_seq;
    s_cur_write_ofs = ELOG_SECTOR_HDR_BYTES;
}

/* ---------------- Public API ---------------- */

void EventJournal_Init(void)
{
    if (!s_q)
    {
        s_q = xQueueCreate(JOURNAL_QUEUE_LEN, sizeof(app_event_t));
    }

    memset(&s_stats, 0, sizeof(s_stats));
    s_stats.base = QSPI_EVENT_LOG_BASE;
    s_stats.size = QSPI_EVENT_LOG_SIZE;
    s_stats.sector_size = QSPI_SECTOR_SIZE;
    s_stats.sectors = sector_count();

    AppQspiLock_Init();

    /* Mount can be a bit slow (scan up to 512KB) but still acceptable at boot. */
    AppQspiLock_Lock();
    mount_or_format();
    AppQspiLock_Unlock();
}

/* Дверные «служебные» события не пишем в кольцевой журнал — только OPEN/CLOSE и прочие типы. */
static int event_journal_should_record(const app_event_t *evt)
{
    switch (evt->type)
    {
        case EVT_DOOR_OPEN_TIMEOUT:
        case EVT_DOOR_POST_CLOSE_READY:
        case EVT_DOOR_SIGNAL_ON:
        case EVT_DOOR_SIGNAL_OFF:
            return 0;
        default:
            return 1;
    }
}

journal_status_t EventJournal_EnqueueEvent(const app_event_t *evt)
{
    if (!s_q || !evt) return JOURNAL_NOT_INIT;

    if (!event_journal_should_record(evt))
    {
        return JOURNAL_OK;
    }

    /* Non-blocking: logging must never stall real-time tasks */
    if (xQueueSendToBack(s_q, evt, 0) != pdTRUE)
    {
        s_stats.dropped_queue++;
        return JOURNAL_QUEUE_FULL;
    }
    return JOURNAL_OK;
}

void EventJournal_LogConfigAction(uint32_t action_id, uint32_t cfg_seq, uint32_t user_id, uint32_t result)
{
    app_event_t e;
    memset(&e, 0, sizeof(e));
    e.type = EVT_SYSTEM_FAULT; /* reuse bus type slot; journal stores raw type */
    e.source = APP_SRC_HTTP;
    e.door_id = 0;
    /* Encode action_id/result/user_id/cfg_seq into arg (simple packing).
     * Later (WEB) this can be upgraded to a dedicated event type.
     */
    e.arg = action_id;
    e.flags = (uint16_t)(result & 0xFFFFu);
    e.ttl_ms = (uint32_t)user_id;
    e.timestamp = (uint32_t)cfg_seq;
    (void)EventJournal_EnqueueEvent(&e);
}

journal_status_t EventJournal_EraseAll(void)
{
    if (!s_q) return JOURNAL_NOT_INIT;

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
    (void)sector_write_header(0, 1);
    s_cur_sector = 0;
    s_cur_sector_seq = 1;
    s_cur_write_ofs = ELOG_SECTOR_HDR_BYTES;
    s_next_rec_seq = 1;
    s_stats.total_records = 0U;
    AppQspiLock_Unlock();
    return JOURNAL_OK;
}

void EventJournal_GetStats(journal_stats_t *out)
{
    if (!out) return;
    AppQspiLock_Lock();
    s_stats.total_records = count_total_valid_records();
    AppQspiLock_Unlock();
    s_stats.current_sector = s_cur_sector;
    s_stats.current_seq = s_cur_sector_seq;
    *out = s_stats;
}

/* ---------------- Task-facing API ---------------- */

BaseType_t EventJournal_WaitEvent(app_event_t *out_evt, TickType_t to)
{
    if (!s_q || !out_evt) return pdFALSE;
    return xQueueReceive(s_q, out_evt, to);
}

void EventJournal_WriteEventToFlash(const app_event_t *evt)
{
    if (!evt) return;

    elog_record_t r;
    memset(&r, 0, sizeof(r));

    r.magic = ELOG_REC_MAGIC;
    r.recSeq = s_next_rec_seq++;

    /* Приоритет: RTC (Unix сек) для отображения в UI; при недоступности — tick или значение от producer */
    uint32_t ts = evt->timestamp;
    if (RTC_GetUnixTime(&ts))
    {
        /* ts уже заполнен Unix timestamp в секундах — подходит для журнала и /api/journal/dump */
    }
    else
    {
        if (ts == 0)
            ts = (uint32_t)xTaskGetTickCount();
    }
    r.timestamp = ts;
    r.type = (uint16_t)evt->type;
    r.source = (uint16_t)evt->source;
    r.door_id = evt->door_id;
    r.flags = (uint8_t)(evt->flags & 0xFFu);
    r.arg = evt->arg;

    r.crc32 = 0;
    r.pad = 0;
    r.crc32 = crc32_buf(&r, sizeof(r));

    /* EVT0 = 32 байта (имя пользователя только в EVT1 / LogUserAction) */
    if ((s_cur_write_ofs + sizeof(elog_record_t)) > QSPI_SECTOR_SIZE)
    {
        advance_sector();
    }

    if ((s_cur_write_ofs + sizeof(elog_record_t)) > QSPI_SECTOR_SIZE)
    {
        s_stats.io_errors++;
        return;
    }

    if (write_record(s_cur_sector, s_cur_write_ofs, &r) != HAL_OK)
    {
        s_stats.io_errors++;
        return;
    }

    s_cur_write_ofs += sizeof(elog_record_t);
    s_stats.records_written++;
    s_stats.total_records++;
}

/* Логирование действия пользователя из UI: имя и время с ПК. Запись 48 байт (EVT1). */
void EventJournal_LogUserAction(uint32_t action_id, const char *username, uint32_t client_unix_sec, uint32_t result)
{
    if (!s_q) return;
    if (username == NULL) username = "";

    elog_record_v2_t r;
    memset(&r, 0, sizeof(r));
    r.magic = ELOG_REC_MAGIC_V2;
    r.recSeq = s_next_rec_seq++;
    r.timestamp = client_unix_sec;  /* время с ПК */
    r.type = (uint16_t)EVT_SYSTEM_FAULT;
    r.source = (uint16_t)APP_SRC_HTTP;
    r.door_id = 0;
    r.flags = (uint8_t)(result & 0xFFu);
    r.arg = action_id;
    (void)strncpy(r.username, username, ELOG_RECORD_V2_USERNAME_LEN - 1);
    r.username[ELOG_RECORD_V2_USERNAME_LEN - 1] = '\0';
    r.crc32 = 0;
    r.pad = 0;
    r.crc32 = crc32_buf(&r, sizeof(r));

    AppQspiLock_Lock();
    if ((s_cur_write_ofs + sizeof(elog_record_v2_t)) > QSPI_SECTOR_SIZE)
        advance_sector();
    if ((s_cur_write_ofs + sizeof(elog_record_v2_t)) <= QSPI_SECTOR_SIZE)
    {
        if (write_record_v2(s_cur_sector, s_cur_write_ofs, &r) == HAL_OK)
        {
            s_cur_write_ofs += sizeof(elog_record_v2_t);
            s_stats.records_written++;
            s_stats.total_records++;
        }
        else
            s_stats.io_errors++;
    }
    else
        s_stats.io_errors++;
    AppQspiLock_Unlock();
}

/* ---------------- Service / debug helpers ----------------
 * Эти функции сделаны специально для проверки этапа 7 (7.4/7.5).
 * Они НЕ участвуют в реальном-time критичной логике: вызывай их из CLI/сервисной задачи.
 */

/* Возвращает смещение последней валидной записи в секторе (поддержка 32- и 48-байтных записей). */
static int find_last_valid_ofs_in_sector(uint32_t sector_index, uint32_t *out_ofs)
{
    const uint32_t base = sector_base(sector_index);
    uint32_t ofs = ELOG_SECTOR_HDR_BYTES;
    uint32_t last_good = 0;

    while (ofs < QSPI_SECTOR_SIZE)
    {
        uint32_t magic = 0;
        if (read_record_magic(base + ofs, &magic) != HAL_OK)
            return 0;
        if (magic == 0xFFFFFFFFu)
            break;
        uint32_t rec_sz = (magic == ELOG_REC_MAGIC) ? sizeof(elog_record_t) :
                          (magic == ELOG_REC_MAGIC_V2) ? sizeof(elog_record_v2_t) : 0;
        if (rec_sz == 0 || (ofs + rec_sz) > QSPI_SECTOR_SIZE)
            break;
        if (rec_sz == sizeof(elog_record_t))
        {
            elog_record_t r;
            if (flash_read(base + ofs, &r, sizeof(r)) != HAL_OK) return 0;
            if (!record_is_valid(&r)) break;
        }
        else
        {
            elog_record_v2_t r2;
            if (flash_read(base + ofs, &r2, sizeof(r2)) != HAL_OK) return 0;
            if (!record_v2_is_valid(&r2)) break;
        }
        last_good = ofs;
        ofs += rec_sz;
    }
    if (last_good == 0) return 0;
    *out_ofs = last_good;
    return 1;
}

/* Человекочитаемые имена для type/source.
 * Важно: журнал хранит числовые значения, а здесь мы только улучшаем вывод для CLI.
 */
static const char* evt_type_to_str(uint16_t t)
{
    switch ((app_event_type_t)t)
    {
        case EVT_NONE:                 return "NONE";

        case EVT_DOOR_OPEN:            return "DOOR_OPEN";
        case EVT_DOOR_CLOSE:           return "DOOR_CLOSE";
        case EVT_DOOR_ALARM:           return "DOOR_ALARM";
        case EVT_DOOR_OPEN_TIMEOUT:    return "DOOR_OPEN_TIMEOUT";
        case EVT_DOOR_POST_CLOSE_READY:return "DOOR_POST_CLOSE_READY";
        case EVT_DOOR_SIGNAL_ON:       return "DOOR_SIGNAL_ON";
        case EVT_DOOR_SIGNAL_OFF:      return "DOOR_SIGNAL_OFF";

        case EVT_CMD_LOCK:             return "CMD_LOCK";
        case EVT_CMD_UNLOCK:           return "CMD_UNLOCK";

        case EVT_NET_LINK_UP:          return "NET_LINK_UP";
        case EVT_NET_LINK_DOWN:        return "NET_LINK_DOWN";

        case EVT_SYSTEM_FAULT:         return "SYSTEM_FAULT";

        default:                       return "UNKNOWN";
    }
}

static const char* evt_src_to_str(uint16_t s)
{
    switch ((app_event_source_t)s)
    {
        case APP_SRC_NONE:        return "NONE";
        case APP_SRC_DOOR_LOCAL:  return "DOOR_LOCAL";
        case APP_SRC_SUPERVISOR:  return "SUPERVISOR";
        case APP_SRC_WATCHDOG:    return "WATCHDOG";
        case APP_SRC_CAN:         return "CAN";
        case APP_SRC_RS485:       return "RS485";
        case APP_SRC_HTTP:        return "HTTP";
        default:                  return "UNKNOWN";
    }
}

void EventJournal_PrintStats(void)
{
    journal_stats_t st;
    EventJournal_GetStats(&st);
    AppLog("JOURNAL: base=0x%08lx size=%lu sect=%lu cnt=%lu cur=%lu seq=%lu rec=%lu drop=%lu io=%lu",
           (unsigned long)st.base,
           (unsigned long)st.size,
           (unsigned long)st.sector_size,
           (unsigned long)st.sectors,
           (unsigned long)st.current_sector,
           (unsigned long)st.current_seq,
           (unsigned long)st.records_written,
           (unsigned long)st.dropped_queue,
           (unsigned long)st.io_errors);
}

journal_status_t EventJournal_Clear(void)
{
    /* Оставляем старое API, но даём более "говорящее" имя для CLI. */
    return EventJournal_EraseAll();
}

void EventJournal_DumpLast(uint32_t count)
{
    if (count == 0) return;

    /* Ограничим разумным числом, чтобы не заспамить UART. */
    if (count > 200) count = 200;

    /* Снимок позиции "хвоста". Он может немного сдвинуться, но для отладки ок. */
    AppQspiLock_Lock();

    uint32_t sector = s_cur_sector;
    uint32_t ofs;

    /* Начинаем с последней записи в текущем секторе.
     * Если текущий сектор пуст (мы на заголовке) -> отступаем назад.
     */
    if (s_cur_write_ofs > ELOG_SECTOR_HDR_BYTES)
        ofs = s_cur_write_ofs - sizeof(elog_record_t);
    else
        ofs = 0;

    elog_record_t *buf = (elog_record_t*)pvPortMalloc(sizeof(elog_record_t) * count);
    uint32_t got = 0;

    while (got < count)
    {
        if (ofs == 0)
        {
            /* Перейти на предыдущий сектор по кольцу */
            const uint32_t scnt = sector_count();
            sector = (sector == 0) ? (scnt - 1U) : (sector - 1U);
            if (!find_last_valid_ofs_in_sector(sector, &ofs))
            {
                /* предыдущий сектор пустой -> дальше искать нечего */
                break;
            }
        }

        elog_record_t r;
        if (flash_read(sector_base(sector) + ofs, &r, sizeof(r)) != HAL_OK)
        {
            s_stats.io_errors++;
            break;
        }
        if (!record_is_valid(&r))
        {
            /* невалидная запись -> останов */
            break;
        }

        buf[got++] = r;

        /* Сдвинуться на предыдущую запись */
        if (ofs >= (ELOG_SECTOR_HDR_BYTES + sizeof(elog_record_t)))
            ofs -= sizeof(elog_record_t);
        else
            ofs = 0;
    }

    AppQspiLock_Unlock();

    if (got == 0)
    {
        AppLog("JOURNAL: dump empty");
        vPortFree(buf);
        return;
    }

    /* Печатаем в хронологическом порядке (старые -> новые). */
    for (int32_t i = (int32_t)got - 1; i >= 0; i--)
    {
        const elog_record_t *r = &buf[i];
        AppLog("JLOG #%lu t=%lu %s(%u) door=%u src=%s(%u) arg=0x%08lx flags=0x%02x",
               (unsigned long)r->recSeq,
               (unsigned long)r->timestamp,
               evt_type_to_str(r->type),
               (unsigned)r->type,
               (unsigned)r->door_id,
               evt_src_to_str(r->source),
               (unsigned)r->source,
               (unsigned long)r->arg,
               (unsigned)r->flags);

    }

    vPortFree(buf);
}

/* =========================================================
 * Дополнительные диагностические функции
 * ========================================================= */

#include "config/config_layout.h" /* QSPI_SECTOR_SIZE */

/* Константы для диагностики */
#define ELOG_SECTOR_HDR_BYTES_DIAG 256U
#define ELOG_RECORD_SIZE_DIAG 32U

void EventJournal_PrintDetailedInfo(void)
{
    journal_stats_t st;
    EventJournal_GetStats(&st);
    
    /* Вычисляем количество записей в журнале */
    const uint32_t records_per_sector = (st.sector_size - ELOG_SECTOR_HDR_BYTES_DIAG) / ELOG_RECORD_SIZE_DIAG;
    const uint32_t max_records_total = st.sectors * records_per_sector;
    
    /* Занятая память */
    const uint32_t used_sectors = (st.records_written / records_per_sector) + 
                                   ((st.records_written % records_per_sector > 0) ? 1 : 0);
    const uint32_t used_memory_bytes = used_sectors * st.sector_size;
    const uint32_t used_memory_kb = used_memory_bytes / 1024U;
    
    AppLog("=== EVENT JOURNAL - DETAILED INFO ===");
    AppLog("Flash address: 0x%08lX", (unsigned long)st.base);
    AppLog("Total size: %lu KB (%lu bytes)", 
           (unsigned long)(st.size / 1024U), (unsigned long)st.size);
    AppLog("Sector size: %lu bytes", (unsigned long)st.sector_size);
    AppLog("Sector count: %lu", (unsigned long)st.sectors);
    AppLog("---");
    AppLog("Current sector: %lu", (unsigned long)st.current_sector);
    AppLog("Sector sequence: %lu", (unsigned long)st.current_seq);
    AppLog("---");
    AppLog("Total records written: %lu", (unsigned long)st.records_written);
    AppLog("Max records (theoretical): ~%lu", (unsigned long)max_records_total);
    AppLog("Records per sector: %lu", (unsigned long)records_per_sector);
    AppLog("---");
    AppLog("Used sectors: ~%lu", (unsigned long)used_sectors);
    AppLog("Used memory: ~%lu KB (~%lu bytes)", 
           (unsigned long)used_memory_kb, (unsigned long)used_memory_bytes);
    AppLog("Free memory: ~%lu KB", 
           (unsigned long)((st.size - used_memory_bytes) / 1024U));
    AppLog("---");
    AppLog("Write errors: %lu", (unsigned long)st.io_errors);
    AppLog("Dropped from queue: %lu", (unsigned long)st.dropped_queue);
    AppLog("===========================================");
}

void EventJournal_PrintRecordInfo(void)
{
    journal_stats_t st;
    EventJournal_GetStats(&st);
    const uint32_t records_per_sector = (st.sector_size - ELOG_SECTOR_HDR_BYTES_DIAG) / ELOG_RECORD_SIZE_DIAG;
    const uint32_t max_records = st.sectors * records_per_sector;
    const uint32_t max_data_bytes = max_records * ELOG_RECORD_SIZE_DIAG;
    
    AppLog("=== RECORD INFORMATION ===");
    AppLog("Record size: %u bytes", (unsigned)ELOG_RECORD_SIZE_DIAG);
    AppLog("Records per sector: %lu (%lu bytes data + %u bytes header = %lu bytes)", 
           (unsigned long)records_per_sector, 
           (unsigned long)(records_per_sector * ELOG_RECORD_SIZE_DIAG),
           (unsigned)ELOG_SECTOR_HDR_BYTES_DIAG,
           (unsigned long)st.sector_size);
    AppLog("Max records in journal: ~%lu (%lu sectors * %lu records)", 
           (unsigned long)max_records, (unsigned long)st.sectors, (unsigned long)records_per_sector);
    AppLog("Max memory for records: ~%lu KB (%lu bytes)", 
           (unsigned long)(max_data_bytes / 1024U), (unsigned long)max_data_bytes);
    AppLog("===========================");
}

/* =========================================================
 * HTTP API: чтение записей с пагинацией (Этап 9)
 * ========================================================= */

journal_status_t EventJournal_ReadRecords(uint32_t offset, uint32_t limit,
                                          journal_record_t *out_records,
                                          uint32_t *out_count)
{
    if (!out_records || !out_count) return JOURNAL_NOT_INIT;
    if (s_q == NULL) return JOURNAL_NOT_INIT; /* журнал не инициализирован */
    if (limit == 0) {
        *out_count = 0;
        return JOURNAL_OK;
    }

    /* Ограничим разумным числом для HTTP API */
    if (limit > 200) limit = 200;

    *out_count = 0;

    AppQspiLock_Lock();

    uint32_t sector = s_cur_sector;
    uint32_t ofs;

    uint32_t rec_size = 0;
    const uint32_t scnt = sector_count();
    const uint32_t base_cur = sector_base(s_cur_sector);

    /* Начальная позиция: последняя запись (поддержка 32 и 48 байт) */
    if (s_cur_write_ofs > ELOG_SECTOR_HDR_BYTES &&
        get_prev_record_at(base_cur, s_cur_write_ofs, &ofs, &rec_size))
    {
        /* ofs — начало последней записи в текущем секторе */
    }
    else
    {
        ofs = 0;
        sector = (s_cur_sector == 0) ? (scnt - 1U) : (s_cur_sector - 1U);
        if (!find_last_valid_ofs_in_sector(sector, &ofs))
        {
            AppQspiLock_Unlock();
            return JOURNAL_OK;
        }
        rec_size = get_record_size_at(sector_base(sector), ofs);
        if (rec_size == 0) rec_size = sizeof(elog_record_t);
    }

    uint32_t skipped = 0;
    uint32_t collected = 0;

    /* Пропуск offset записей */
    while (skipped < offset)
    {
        uint32_t prev_ofs, prev_sz;
        uint32_t base = sector_base(sector);
        if (get_prev_record_at(base, ofs, &prev_ofs, &prev_sz))
        {
            ofs = prev_ofs;
            rec_size = prev_sz;
            skipped++;
            continue;
        }
        sector = (sector == 0) ? (scnt - 1U) : (sector - 1U);
        if (!find_last_valid_ofs_in_sector(sector, &ofs))
        {
            AppQspiLock_Unlock();
            return JOURNAL_OK;
        }
        rec_size = get_record_size_at(sector_base(sector), ofs);
        if (rec_size == 0) rec_size = sizeof(elog_record_t);
        skipped++;
    }

    /* Сбор limit записей (поддержка 32- и 48-байтных записей, username для EVT1) */
    while (collected < limit)
    {
        uint32_t base = sector_base(sector);
        uint32_t magic = 0;
        if (flash_read(base + ofs, &magic, sizeof(magic)) != HAL_OK)
        {
            s_stats.io_errors++;
            break;
        }
        if (magic == ELOG_REC_MAGIC)
        {
            elog_record_t r;
            if (flash_read(base + ofs, &r, sizeof(r)) != HAL_OK) { s_stats.io_errors++; break; }
            if (!record_is_valid(&r)) break;
            out_records[collected].recSeq = r.recSeq;
            out_records[collected].timestamp = r.timestamp;
            out_records[collected].type = r.type;
            out_records[collected].source = r.source;
            out_records[collected].door_id = r.door_id;
            out_records[collected].flags = r.flags;
            out_records[collected].arg = r.arg;
            out_records[collected].username[0] = '\0';
            rec_size = sizeof(elog_record_t);
        }
        else if (magic == ELOG_REC_MAGIC_V2)
        {
            elog_record_v2_t r2;
            if (flash_read(base + ofs, &r2, sizeof(r2)) != HAL_OK) { s_stats.io_errors++; break; }
            if (!record_v2_is_valid(&r2)) break;
            out_records[collected].recSeq = r2.recSeq;
            out_records[collected].timestamp = r2.timestamp;
            out_records[collected].type = r2.type;
            out_records[collected].source = r2.source;
            out_records[collected].door_id = r2.door_id;
            out_records[collected].flags = r2.flags;
            out_records[collected].arg = r2.arg;
            (void)strncpy(out_records[collected].username, r2.username, JOURNAL_RECORD_USERNAME_MAX - 1);
            out_records[collected].username[JOURNAL_RECORD_USERNAME_MAX - 1] = '\0';
            rec_size = sizeof(elog_record_v2_t);
        }
        else
            break;
        collected++;

        uint32_t prev_ofs, prev_sz;
        if (get_prev_record_at(base, ofs, &prev_ofs, &prev_sz))
        {
            ofs = prev_ofs;
            rec_size = prev_sz;
            continue;
        }
        sector = (sector == 0) ? (scnt - 1U) : (sector - 1U);
        if (!find_last_valid_ofs_in_sector(sector, &ofs))
            break;
        rec_size = get_record_size_at(sector_base(sector), ofs);
        if (rec_size == 0) rec_size = sizeof(elog_record_t);
    }

    AppQspiLock_Unlock();

    *out_count = collected;
    return JOURNAL_OK;
}
