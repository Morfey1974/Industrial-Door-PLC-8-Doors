#pragma once

#include <stdint.h>
#include "config/users_format.h"
#include "config/config_format.h" /* Для Config_CalcCrc32 */

/* =========================================================
 * Хранение пользователей в QSPI Flash
 * 
 * Реализует:
 *  - LoadUsers: загрузка базы данных пользователей
 *  - SaveUsers: сохранение базы данных пользователей
 *  - InitOrDefault: создание базы по умолчанию при первом запуске
 * ========================================================= */

#ifdef __cplusplus
extern "C" {
#endif

typedef enum
{
    USERS_ST_OK = 0,
    USERS_ST_NO_VALID = 1,
    USERS_ST_IO_ERROR = 2,
    USERS_ST_BAD_FORMAT = 3,
    USERS_ST_ARG = 4,
} users_storage_status_t;

/* Структура для хранения информации о базе пользователей */
typedef struct
{
    users_storage_status_t status;
    uint32_t seq;            /* Sequence number */
} users_storage_info_t;

/* Загрузить базу данных пользователей из QSPI */
users_storage_status_t UsersStorage_Load(users_db_header_t *out_header,
                                          user_record_t *out_users,
                                          size_t max_users,
                                          users_storage_info_t *out_info);

/* Сохранить базу данных пользователей в QSPI */
users_storage_status_t UsersStorage_Save(const users_db_header_t *header,
                                         const user_record_t *users,
                                         size_t user_count,
                                         users_storage_info_t *inout_info);

/* Инициализировать базу пользователей (загрузить или создать по умолчанию) */
users_storage_status_t UsersStorage_InitOrDefault(users_db_header_t *out_header,
                                                    user_record_t *out_users,
                                                    size_t max_users,
                                                    users_storage_info_t *out_info);

/* Вспомогательная функция для вычисления CRC (для users_service.c) */
uint32_t users_db_crc32(const users_db_header_t *hdr, const user_record_t *users, size_t user_count);

#ifdef __cplusplus
}
#endif
