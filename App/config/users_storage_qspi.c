#include "users_storage_qspi.h"

#include <string.h>
#include <stdio.h>

#include "config/config_layout.h"
#include "config/users_format.h"
#include "config/config_format.h" /* Для Config_CalcCrc32 */
#include "config/password_hash.h"

#include "system/app_qspi_lock.h"
#include "system/app_log.h"
#include "system_node.h"

/* Фасад драйвера QSPI */
#include "qspi_bringup.h"

#include "stm32h7xx_hal.h"

/* Вспомогательные функции для работы с QSPI */
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

/* Вычисление CRC32 для базы пользователей */
uint32_t users_db_crc32(const users_db_header_t *hdr, const user_record_t *users, size_t user_count)
{
    uint32_t crc = 0U;
    
    /* CRC заголовка (без поля crc32) */
    users_db_header_t tmp = *hdr;
    tmp.crc32 = 0U;
    crc = Config_CalcCrc32(&tmp, sizeof(tmp));
    
    /* CRC всех записей пользователей */
    if (users && user_count > 0)
    {
        crc = Config_CalcCrc32(users, user_count * sizeof(user_record_t));
    }
    
    return crc;
}

/* Проверка валидности заголовка */
static uint8_t header_is_valid(const users_db_header_t *hdr, const user_record_t *users, size_t user_count)
{
    if (!users_header_is_valid(hdr))
        return 0U;
    
    /* Проверка CRC */
    uint32_t computed_crc = users_db_crc32(hdr, users, user_count);
    if (computed_crc != hdr->crc32)
        return 0U;
    
    return 1U;
}

/* Загрузка базы пользователей из QSPI */
users_storage_status_t UsersStorage_Load(users_db_header_t *out_header,
                                          user_record_t *out_users,
                                          size_t max_users,
                                          users_storage_info_t *out_info)
{
    if (!out_header || !out_users || !out_info || max_users == 0)
        return USERS_ST_ARG;
    
    if (System_GetRole() != APP_ROLE_MASTER)
        return USERS_ST_NOT_MASTER;
    
    memset(out_header, 0, sizeof(*out_header));
    memset(out_info, 0, sizeof(*out_info));
    out_info->status = USERS_ST_NO_VALID;
    
    /* Читаем заголовок */
    if (qspi_read(QSPI_USERS_DB_BASE, out_header, sizeof(*out_header)) != 0)
    {
        AppLog("[USERS] Load: IO error reading header");
        return USERS_ST_IO_ERROR;
    }
    
    /* Проверяем валидность заголовка */
    if (!users_header_is_valid(out_header))
    {
        AppLog("[USERS] Load: Invalid header");
        return USERS_ST_NO_VALID;
    }
    
    /* Проверяем количество пользователей */
    if (out_header->userCount > max_users || out_header->userCount > USERS_MAX_COUNT)
    {
        AppLog("[USERS] Load: Invalid user count %lu", (unsigned long)out_header->userCount);
        return USERS_ST_BAD_FORMAT;
    }
    
    /* Читаем записи пользователей */
    if (out_header->userCount > 0)
    {
        size_t users_size = out_header->userCount * sizeof(user_record_t);
        if (qspi_read(QSPI_USERS_DB_BASE + sizeof(*out_header), out_users, users_size) != 0)
        {
            AppLog("[USERS] Load: IO error reading users");
            return USERS_ST_IO_ERROR;
        }
    }
    
    /* Проверяем CRC */
    if (!header_is_valid(out_header, out_users, out_header->userCount))
    {
        AppLog("[USERS] Load: CRC mismatch");
        return USERS_ST_BAD_FORMAT;
    }
    
    out_info->status = USERS_ST_OK;
    out_info->seq = out_header->seq;
    AppLog("[USERS] Load: OK, %lu users, seq=%lu", (unsigned long)out_header->userCount, (unsigned long)out_header->seq);
    
    return USERS_ST_OK;
}

/* Сохранение базы пользователей в QSPI */
users_storage_status_t UsersStorage_Save(const users_db_header_t *header,
                                         const user_record_t *users,
                                         size_t user_count,
                                         users_storage_info_t *inout_info)
{
    if (!header || !users || user_count == 0 || !inout_info)
        return USERS_ST_ARG;
    
    if (System_GetRole() != APP_ROLE_MASTER)
        return USERS_ST_NOT_MASTER;
    
    if (user_count > USERS_MAX_COUNT)
    {
        AppLog("[USERS] Save: Too many users %lu", (unsigned long)user_count);
        return USERS_ST_ARG;
    }
    
    /* Подготавливаем заголовок */
    users_db_header_t hdr = *header;
    hdr.seq = (inout_info->seq == 0) ? 1U : (inout_info->seq + 1U);
    hdr.userCount = (uint32_t)user_count;
    
    /* Вычисляем CRC */
    hdr.crc32 = users_db_crc32(&hdr, users, user_count);
    
    /* Стираем сектор (128 KiB = 32 сектора по 4 KiB) */
    AppLog("[USERS] Save: Erasing %lu sectors", (unsigned long)(QSPI_USERS_DB_SIZE / QSPI_SECTOR_SIZE));
    for (uint32_t i = 0; i < (QSPI_USERS_DB_SIZE / QSPI_SECTOR_SIZE); i++)
    {
        uint32_t addr = QSPI_USERS_DB_BASE + i * QSPI_SECTOR_SIZE;
        if (qspi_erase_4k(addr) != 0)
        {
            AppLog("[USERS] Save: Erase failed at 0x%08lX", (unsigned long)addr);
            return USERS_ST_IO_ERROR;
        }
    }
    
    /* Записываем заголовок */
    if (qspi_write_page(QSPI_USERS_DB_BASE, &hdr, sizeof(hdr)) != 0)
    {
        AppLog("[USERS] Save: Write header failed");
        return USERS_ST_IO_ERROR;
    }
    
    /* Записываем записи пользователей */
    size_t users_size = user_count * sizeof(user_record_t);
    const uint8_t *p = (const uint8_t *)users;
    uint32_t addr = QSPI_USERS_DB_BASE + sizeof(hdr);
    size_t left = users_size;
    
    while (left > 0)
    {
        size_t chunk = (left > QSPI_PAGE_SIZE) ? QSPI_PAGE_SIZE : left;
        if (qspi_write_page(addr, p, chunk) != 0)
        {
            AppLog("[USERS] Save: Write users failed at 0x%08lX", (unsigned long)addr);
            return USERS_ST_IO_ERROR;
        }
        addr += chunk;
        p += chunk;
        left -= chunk;
    }
    
    inout_info->status = USERS_ST_OK;
    inout_info->seq = hdr.seq;
    AppLog("[USERS] Save: OK, %lu users, seq=%lu", (unsigned long)user_count, (unsigned long)hdr.seq);
    
    return USERS_ST_OK;
}

/* Создание базы пользователей по умолчанию */
static users_storage_status_t create_default_users(users_db_header_t *out_header,
                                                    user_record_t *out_users,
                                                    size_t max_users)
{
    if (!out_header || !out_users || max_users == 0)
        return USERS_ST_ARG;
    
    memset(out_header, 0, sizeof(*out_header));
    memset(out_users, 0, max_users * sizeof(user_record_t));
    
    /* Инициализируем заголовок */
    out_header->magic = USERS_DB_MAGIC;
    out_header->formatVersion = USERS_FORMAT_VERSION;
    out_header->seq = 1U;
    out_header->userCount = 1U; /* Только admin */
    
    /* Создаем пользователя admin */
    user_record_t *admin = &out_users[0];
    (void)strncpy(admin->username, "admin", sizeof(admin->username) - 1);
    admin->username[sizeof(admin->username) - 1] = 0;
    
    /* Генерируем соль и хешируем пароль "admin" */
    PasswordHash_GenerateSalt(admin->passwordSalt, sizeof(admin->passwordSalt));
    PasswordHash_HashPassword("admin", admin->passwordSalt, admin->passwordHash, sizeof(admin->passwordHash));
    
    admin->role = USER_ROLE_SUPER_ADMIN;
    admin->enabled = 1U;
    admin->createdAt = HAL_GetTick();
    admin->lastLogin = 0U;
    
    /* Вычисляем CRC */
    out_header->crc32 = users_db_crc32(out_header, out_users, 1U);
    
    AppLog("[USERS] Default: Created admin user");
    return USERS_ST_OK;
}

/* Инициализация базы пользователей */
users_storage_status_t UsersStorage_InitOrDefault(users_db_header_t *out_header,
                                                    user_record_t *out_users,
                                                    size_t max_users,
                                                    users_storage_info_t *out_info)
{
    if (!out_header || !out_users || !out_info || max_users == 0)
        return USERS_ST_ARG;
    
    if (System_GetRole() != APP_ROLE_MASTER)
        return USERS_ST_NOT_MASTER;
    
    /* Пытаемся загрузить существующую базу */
    users_storage_status_t status = UsersStorage_Load(out_header, out_users, max_users, out_info);
    
    if (status == USERS_ST_OK)
    {
        AppLog("[USERS] Init: Loaded existing database");
        return USERS_ST_OK;
    }
    
    /* Если базы нет, создаем по умолчанию */
    if (status == USERS_ST_NO_VALID)
    {
        AppLog("[USERS] Init: No valid database, creating default");
        status = create_default_users(out_header, out_users, max_users);
        if (status == USERS_ST_OK)
        {
            /* Сохраняем в QSPI */
            users_storage_info_t save_info = {0};
            save_info.seq = 0U;
            status = UsersStorage_Save(out_header, out_users, 1U, &save_info);
            if (status == USERS_ST_OK)
            {
                out_info->status = USERS_ST_OK;
                out_info->seq = save_info.seq;
            }
        }
    }
    
    return status;
}
