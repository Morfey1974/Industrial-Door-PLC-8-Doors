#include "mapping_storage_qspi.h"
#include "config/config_layout.h"

#include <string.h>

#include "stm32h7xx_hal.h"
#include "system/app_qspi_lock.h"
#include "qspi_bringup.h"

#define MAPPING_MAGIC  0x4D415050u  /* "MAPP" */

static char s_mapping_buf[MAPPING_STORAGE_MAX_LEN];
static size_t s_mapping_len = 0U;

static int qspi_read(uint32_t addr, void *dst, uint32_t len)
{
    AppQspiLock_Lock();
    int rc = (QSPI_Flash_Read(addr, (uint8_t *)dst, (uint32_t)len) == HAL_OK) ? 0 : -1;
    AppQspiLock_Unlock();
    return rc;
}

static int qspi_write_page(uint32_t addr, const void *src, uint32_t len)
{
    AppQspiLock_Lock();
    int rc = (QSPI_Flash_ProgramPage(addr, (const uint8_t *)src, (uint32_t)len) == HAL_OK) ? 0 : -1;
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

void MappingStorage_LoadFromQspi(void)
{
    uint8_t hdr[8];
    if (qspi_read((uint32_t)QSPI_MAPPING_BASE, hdr, sizeof(hdr)) != 0) {
        s_mapping_len = 0U;
        return;
    }
    uint32_t magic = (uint32_t)hdr[0] | ((uint32_t)hdr[1] << 8) | ((uint32_t)hdr[2] << 16) | ((uint32_t)hdr[3] << 24);
    uint32_t len   = (uint32_t)hdr[4] | ((uint32_t)hdr[5] << 8) | ((uint32_t)hdr[6] << 16) | ((uint32_t)hdr[7] << 24);
    if (magic != MAPPING_MAGIC || len == 0U || len > MAPPING_STORAGE_MAX_LEN) {
        s_mapping_len = 0U;
        return;
    }
    if (qspi_read((uint32_t)QSPI_MAPPING_BASE + 8U, s_mapping_buf, len) != 0) {
        s_mapping_len = 0U;
        return;
    }
    s_mapping_buf[len] = '\0';
    s_mapping_len = (size_t)len;
}

int MappingStorage_SaveToQspi(void)
{
    if (s_mapping_len == 0U)
        return 0;
    /* Область 8 KiB — стираем оба сектора по 4 KiB */
    if (qspi_erase_4k((uint32_t)QSPI_MAPPING_BASE) != 0)
        return -1;
    if (qspi_erase_4k((uint32_t)QSPI_MAPPING_BASE + 4096U) != 0)
        return -1;
    uint8_t hdr[8];
    hdr[0] = (uint8_t)(MAPPING_MAGIC);
    hdr[1] = (uint8_t)(MAPPING_MAGIC >> 8);
    hdr[2] = (uint8_t)(MAPPING_MAGIC >> 16);
    hdr[3] = (uint8_t)(MAPPING_MAGIC >> 24);
    uint32_t len32 = (uint32_t)s_mapping_len;
    hdr[4] = (uint8_t)(len32);
    hdr[5] = (uint8_t)(len32 >> 8);
    hdr[6] = (uint8_t)(len32 >> 16);
    hdr[7] = (uint8_t)(len32 >> 24);
    if (qspi_write_page((uint32_t)QSPI_MAPPING_BASE, hdr, sizeof(hdr)) != 0)
        return -1;
    uint32_t addr = (uint32_t)QSPI_MAPPING_BASE + 8U;
    uint32_t left = (uint32_t)s_mapping_len;
    const uint8_t *p = (const uint8_t *)s_mapping_buf;
    while (left) {
        uint32_t chunk = (left > (uint32_t)QSPI_PAGE_SIZE) ? (uint32_t)QSPI_PAGE_SIZE : left;
        if (qspi_write_page(addr, p, chunk) != 0)
            return -1;
        addr += chunk;
        p += chunk;
        left -= chunk;
    }
    return 0;
}

const char *MappingStorage_GetData(void)
{
    return s_mapping_buf;
}

size_t MappingStorage_GetLen(void)
{
    return s_mapping_len;
}

void MappingStorage_SetData(const char *data, size_t len)
{
    if (!data) {
        s_mapping_len = 0U;
        return;
    }
    if (len > MAPPING_STORAGE_MAX_LEN)
        len = MAPPING_STORAGE_MAX_LEN;
    memcpy(s_mapping_buf, data, len);
    s_mapping_buf[len] = '\0';
    s_mapping_len = len;
}
