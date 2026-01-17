#include "config_storage_qspi.h"

#include <string.h>

#include "config/config_layout.h"
#include "config/config_format.h"

#include "system/app_qspi_lock.h"

/* Фасад драйвера QSPI (реализация в Core/Src проекта). */
#include "qspi_bringup.h"

#ifdef CFG_TEST_SAVE
/* HAL_Delay() для тестовых пауз в окнах power-cut. */
#include "stm32h7xx_hal.h"
#endif

#ifdef CFG_TEST_SAVE
/*
 * Слабый хук для печати диагностических сообщений теста 7.3.
 * По умолчанию молчит, но может быть переопределён в приложении
 * (например, в main.c) и выводить в UART3.
 */
__attribute__((weak)) void CfgTestHook_Print(const char *s)
{
    (void)s;
}
#endif

/*
 * Правила хранения (Этап 7.2/7.3):
 *  - Два слота A/B.
 *  - Новая конфигурация пишется в НЕактивный слот: erase -> payload -> commit.
 *  - Commit выполняется записью валидного заголовка ПОСЛЕДНИМ (атомарная активация).
 *  - На старте выбирается самый новый валидный слот по seq.
 */

static uint32_t slot_base(uint8_t slot)
{
    return (slot == 0U) ? (uint32_t)QSPI_CFG_SLOT_A_BASE : (uint32_t)QSPI_CFG_SLOT_B_BASE;
}

static int qspi_read(uint32_t addr, void *dst, uint32_t len)
{
    AppQspiLock_Lock();
    int rc = (QSPI_Flash_Read(addr, (uint8_t*)dst, (uint16_t)len) == HAL_OK) ? 0 : -1;
    AppQspiLock_Unlock();
    return rc;
}

static int qspi_write_page(uint32_t addr, const void *src, uint32_t len)
{
    AppQspiLock_Lock();
    int rc = (QSPI_Flash_ProgramPage(addr, (const uint8_t*)src, (uint16_t)len) == HAL_OK) ? 0 : -1;
    AppQspiLock_Unlock();
    return rc;
}

static int qspi_erase_4k(uint32_t addr)
{
    AppQspiLock_Lock();
    int rc = (QSPI_Flash_Erase4K(addr) == HAL_OK) ? 0 : -1;
    AppQspiLock_Unlock();
    return rc;
}

static int qspi_erase_region_4k(uint32_t base, uint32_t size)
{
    for (uint32_t off = 0; off < size; off += (uint32_t)QSPI_SECTOR_SIZE)
    {
        if (qspi_erase_4k(base + off) != 0)
            return -1;
    }
    return 0;
}

static uint32_t header_crc32(const cfg_slot_header_t *h)
{
    cfg_slot_header_t tmp = *h;
    tmp.headerCrc32 = 0U;
    return Config_CalcCrc32(&tmp, sizeof(tmp));
}

static uint8_t header_is_valid(const cfg_slot_header_t *h)
{
    if (!h) return 0U;
    if (h->magic != CFG_SLOT_MAGIC) return 0U;
    if (h->formatVersion != CFG_FORMAT_VERSION) return 0U;
    if (h->payloadLen != (uint32_t)sizeof(project_config_t)) return 0U;
    if (h->headerCrc32 != header_crc32(h)) return 0U;
    return 1U;
}

static uint8_t payload_is_valid(const project_config_t *cfg, const cfg_slot_header_t *h)
{
    if (!cfg || !h) return 0U;
    if (Config_CalcCrc32(cfg, sizeof(*cfg)) != h->payloadCrc32) return 0U;

    cfg_validate_error_t verr;
    if (Config_Validate(cfg, &verr) != CFG_VALIDATE_OK)
        return 0U;

    return 1U;
}

cfg_storage_status_t ConfigStorage_LoadActive(project_config_t *out_cfg, cfg_storage_info_t *out_info)
{
    if (!out_cfg || !out_info)
        return CFGST_ARG;

    memset(out_info, 0, sizeof(*out_info));
    out_info->status = CFGST_NO_VALID;
    out_info->used_slot = 0U;

    cfg_slot_header_t ha, hb;
    if (qspi_read(slot_base(0U) + QSPI_CFG_HEADER_OFFSET, &ha, (uint32_t)sizeof(ha)) != 0) return CFGST_IO_ERROR;
    if (qspi_read(slot_base(1U) + QSPI_CFG_HEADER_OFFSET, &hb, (uint32_t)sizeof(hb)) != 0) return CFGST_IO_ERROR;

    const uint8_t va = header_is_valid(&ha);
    const uint8_t vb = header_is_valid(&hb);

    if (!va && !vb)
        return CFGST_NO_VALID;

    uint8_t chosen = 0U;
    const cfg_slot_header_t *hc = &ha;
    if (va && vb)
    {
        chosen = (ha.seq >= hb.seq) ? 0U : 1U;
        hc = (chosen == 0U) ? &ha : &hb;
    }
    else if (!va && vb)
    {
        chosen = 1U;
        hc = &hb;
    }

    const uint32_t base = slot_base(chosen);
    const uint32_t payload_addr = base + QSPI_CFG_PAYLOAD_OFFSET;

    if (qspi_read(payload_addr, out_cfg, (uint32_t)sizeof(*out_cfg)) != 0)
        return CFGST_IO_ERROR;

    if (!payload_is_valid(out_cfg, hc))
        return CFGST_BAD_FORMAT;

    out_info->status = CFGST_OK;
    out_info->used_slot = (uint8_t)(chosen + 1U); /* 1=A, 2=B */
    out_info->seq = hc->seq;
    return CFGST_OK;
}

cfg_storage_status_t ConfigStorage_SaveNew(const project_config_t *cfg, cfg_storage_info_t *inout_info)
{
    if (!cfg || !inout_info)
        return CFGST_ARG;

    /* Валидация перед записью */
    cfg_validate_error_t verr;
    if (Config_Validate(cfg, &verr) != CFG_VALIDATE_OK)
        return CFGST_BAD_FORMAT;

    /* Выбор целевого слота: противоположный активному (или A, если активный неизвестен) */
    uint8_t current = 0xFFU;
    if (inout_info->used_slot == 1U) current = 0U; /* A */
    else if (inout_info->used_slot == 2U) current = 1U; /* B */

    uint8_t target = 0U;
    if (current == 0U) target = 1U;
    else if (current == 1U) target = 0U;

    const uint32_t base = slot_base(target);

    /* Стираем весь слот */
    if (qspi_erase_region_4k(base, (uint32_t)QSPI_CFG_SLOT_SIZE) != 0)
        return CFGST_IO_ERROR;

    /* Пишем payload постранично */
    const uint8_t *p = (const uint8_t*)cfg;
    uint32_t addr = base + QSPI_CFG_PAYLOAD_OFFSET;
    uint32_t left = (uint32_t)sizeof(project_config_t);
    while (left)
    {
        const uint32_t chunk = (left > (uint32_t)QSPI_PAGE_SIZE) ? (uint32_t)QSPI_PAGE_SIZE : left;
        if (qspi_write_page(addr, p, chunk) != 0)
            return CFGST_IO_ERROR;
        addr += chunk;
        p += chunk;
        left -= chunk;
    }

#ifdef CFG_TEST_SAVE
    /*
     * ОКНО ДЛЯ POWER-CUT (7.3):
     * payload уже полностью записан, но commit-header ещё НЕ записан.
     * Если отключить питание в этом окне — при следующем старте должен
     * подняться СТАРЫЙ слот (commit не успел), но никогда не «мусор».
     */
    CfgTestHook_Print("CFG_TEST: window 1 - payload recorded, commit not yet (1500 ms)\r\n");
    HAL_Delay(1500);
#endif

    /* Подготовка заголовка */
    cfg_slot_header_t h;
    memset(&h, 0, sizeof(h));
    h.magic = CFG_SLOT_MAGIC;
    h.seq = (inout_info->seq == 0U) ? 1U : (inout_info->seq + 1U);
    h.formatVersion = CFG_FORMAT_VERSION;
    h.payloadLen = (uint32_t)sizeof(project_config_t);
    h.payloadCrc32 = Config_CalcCrc32(cfg, sizeof(*cfg));
    h.headerCrc32 = header_crc32(&h);

    /* Commit заголовка ПОСЛЕДНИМ (атомарная активация) */

#ifdef CFG_TEST_SAVE
    /*
     * ОКНО ДЛЯ POWER-CUT (7.3):
     * Сейчас начнётся запись commit-header (самый «важный» момент).
     * Если отключить питание тут — должен подняться либо старый слот,
     * либо новый (если commit уже успел записаться полностью).
     */
    CfgTestHook_Print("CFG_TEST: window 2 - before recording commit-header (1000 ms)\r\n");
    HAL_Delay(1000);
#endif

    if (qspi_write_page(base + QSPI_CFG_HEADER_OFFSET, &h, (uint32_t)sizeof(h)) != 0)
        return CFGST_IO_ERROR;

#ifdef CFG_TEST_SAVE
    /*
     * ОКНО ДЛЯ POWER-CUT (7.3):
     * commit-header уже записан. Если отключить питание сейчас — при старте
     * должен подняться НОВЫЙ слот (commit валиден).
     */
    CfgTestHook_Print("CFG_TEST: Window 3 - commit written (1000 ms)\r\n");
    HAL_Delay(1000);
#endif

    /* Обновление информации о выбранном слоте */
    inout_info->status = CFGST_OK;
    inout_info->used_slot = (uint8_t)(target + 1U);
    inout_info->seq = h.seq;
    return CFGST_OK;
}

cfg_storage_status_t ConfigStorage_InitOrDefault(project_config_t *out_cfg, cfg_storage_info_t *out_info)
{
    if (!out_cfg || !out_info)
        return CFGST_ARG;

    cfg_storage_status_t st = ConfigStorage_LoadActive(out_cfg, out_info);
    if (st == CFGST_OK)
        return st;

    /* Валидного конфига нет: создаём дефолтный и сохраняем */
    Config_Default(out_cfg);
    Config_Finalize(out_cfg);

    memset(out_info, 0, sizeof(*out_info));
    out_info->status = CFGST_NO_VALID;
    out_info->used_slot = 0U;
    out_info->seq = 0U;

    return ConfigStorage_SaveNew(out_cfg, out_info);
}
