#pragma once

#include <stdint.h>
#include <stddef.h>

/* =========================================================
 * Формат хранения пользователей в QSPI Flash
 * 
 * Структура:
 *  - users_db_header_t - заголовок базы данных пользователей
 *  - user_record_t[] - массив записей пользователей
 * 
 * Роли:
 *  - USER_ROLE_SUPER_ADMIN (0) - Супер-администратор
 *  - USER_ROLE_ADMIN (1) - Администратор
 *  - USER_ROLE_OPERATOR (2) - Оператор/Мониторинг
 * ========================================================= */

/* Версия формата */
#define USERS_FORMAT_VERSION 0x00010001U

/* Максимальное количество пользователей */
#define USERS_MAX_COUNT 20U

/* Длина имени пользователя */
#define USERNAME_MAX_LEN 32U

/* Длина хеша пароля (SHA-256 = 32 байта) */
#define PASSWORD_HASH_LEN 32U

/* Длина соли для пароля */
#define PASSWORD_SALT_LEN 16U

/* Роли пользователей */
typedef enum
{
    USER_ROLE_SUPER_ADMIN = 0,
    USER_ROLE_ADMIN = 1,
    USER_ROLE_OPERATOR = 2,
} user_role_t;

/* Запись пользователя */
typedef struct
{
    char username[USERNAME_MAX_LEN];           /* Имя пользователя (null-terminated) */
    uint8_t passwordHash[PASSWORD_HASH_LEN];   /* SHA-256 хеш пароля */
    uint8_t passwordSalt[PASSWORD_SALT_LEN];   /* Соль для пароля */
    user_role_t role;                          /* Роль пользователя */
    uint8_t enabled;                           /* 1 = включен, 0 = отключен */
    uint32_t createdAt;                        /* Время создания (HAL_GetTick или timestamp) */
    uint32_t lastLogin;                        /* Время последнего входа (0 = никогда) */
} user_record_t;

/* Заголовок базы данных пользователей */
typedef struct
{
    uint32_t magic;                            /* Magic number ("USRS") */
    uint32_t formatVersion;                    /* Версия формата */
    uint32_t userCount;                        /* Количество пользователей */
    uint32_t seq;                              /* Sequence number для атомарного обновления */
    uint32_t crc32;                            /* CRC32 заголовка и всех записей */
} users_db_header_t;

/* Magic number для заголовка */
#define USERS_DB_MAGIC 0x55535253U /* "USRS" */

/* Полный размер базы данных пользователей */
#define USERS_DB_SIZE (sizeof(users_db_header_t) + (USERS_MAX_COUNT * sizeof(user_record_t)))

#ifdef __cplusplus
extern "C" {
#endif

/* Проверка валидности заголовка */
static inline uint8_t users_header_is_valid(const users_db_header_t *hdr)
{
    return (hdr != NULL &&
            hdr->magic == USERS_DB_MAGIC &&
            hdr->formatVersion == USERS_FORMAT_VERSION &&
            hdr->userCount <= USERS_MAX_COUNT);
}

/* Получение названия роли для отображения */
const char* Users_GetRoleName(user_role_t role);

#ifdef __cplusplus
}
#endif
