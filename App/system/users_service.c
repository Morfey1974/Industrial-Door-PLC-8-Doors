#include "users_service.h"

#include <string.h>
#include <stdio.h>

#include "config/users_format.h"
#include "config/users_storage_qspi.h"
#include "config/password_hash.h"
#include "system/app_log.h"
#include "stm32h7xx_hal.h"

/* Глобальная база пользователей в памяти */
static users_db_header_t g_users_db_header;
static user_record_t g_users_db[USERS_MAX_COUNT];
static uint8_t g_users_db_loaded = 0U;

/* Инициализация сервиса */
uint8_t UsersService_Init(void)
{
    if (g_users_db_loaded)
        return 1U; /* Уже загружено */
    
    users_storage_info_t info = {0};
    users_storage_status_t status = UsersStorage_InitOrDefault(&g_users_db_header, g_users_db, USERS_MAX_COUNT, &info);
    
    if (status == USERS_ST_OK)
    {
        g_users_db_loaded = 1U;
        AppLog("[USERS] Service: Initialized, %lu users", (unsigned long)g_users_db_header.userCount);
        return 1U;
    }
    
    AppLog("[USERS] Service: Init failed, status=%d", (int)status);
    return 0U;
}

/* Поиск пользователя по имени */
const user_record_t* UsersService_FindUser(const char *username)
{
    if (!username || !g_users_db_loaded)
        return NULL;
    
    for (uint32_t i = 0; i < g_users_db_header.userCount && i < USERS_MAX_COUNT; i++)
    {
        if (strcmp(g_users_db[i].username, username) == 0)
        {
            return &g_users_db[i];
        }
    }
    
    return NULL;
}

/* Проверка пароля пользователя */
uint8_t UsersService_VerifyPassword(const char *username, const char *password)
{
    if (!username || !password)
        return 0U;
    
    const user_record_t *user = UsersService_FindUser(username);
    if (!user || !user->enabled)
        return 0U;
    
    return PasswordHash_VerifyPassword(password, user->passwordSalt, user->passwordHash, PASSWORD_HASH_LEN);
}

/* Получение роли пользователя */
user_role_t UsersService_GetUserRole(const char *username)
{
    const user_record_t *user = UsersService_FindUser(username);
    if (!user)
        return USER_ROLE_OPERATOR; /* По умолчанию минимальные права */
    
    return user->role;
}

/* Получение всех пользователей */
uint8_t UsersService_GetAllUsers(user_record_t *out_users, size_t max_users, uint32_t *out_count)
{
    if (!out_users || !out_count || !g_users_db_loaded)
        return 0U;
    
    uint32_t count = (g_users_db_header.userCount < max_users) ? g_users_db_header.userCount : (uint32_t)max_users;
    memcpy(out_users, g_users_db, count * sizeof(user_record_t));
    *out_count = count;
    
    return 1U;
}

/* Сохранение базы в QSPI */
static uint8_t save_users_db(void)
{
    users_storage_info_t info = {0};
    info.seq = g_users_db_header.seq;
    
    users_storage_status_t status = UsersStorage_Save(&g_users_db_header, g_users_db, g_users_db_header.userCount, &info);
    if (status == USERS_ST_OK)
    {
        g_users_db_header.seq = info.seq;
        return 1U;
    }
    
    AppLog("[USERS] Service: Save failed, status=%d", (int)status);
    return 0U;
}

/* Создание нового пользователя */
uint8_t UsersService_CreateUser(const char *username, const char *password, user_role_t role)
{
    if (!username || !password || !g_users_db_loaded)
        return 0U;
    
    /* Проверяем, не существует ли уже такой пользователь */
    if (UsersService_FindUser(username) != NULL)
    {
        AppLog("[USERS] Service: User %s already exists", username);
        return 0U;
    }
    
    /* Проверяем лимит */
    if (g_users_db_header.userCount >= USERS_MAX_COUNT)
    {
        AppLog("[USERS] Service: Max users reached");
        return 0U;
    }
    
    /* Создаем нового пользователя */
    user_record_t *new_user = &g_users_db[g_users_db_header.userCount];
    memset(new_user, 0, sizeof(*new_user));
    
    (void)strncpy(new_user->username, username, sizeof(new_user->username) - 1);
    new_user->username[sizeof(new_user->username) - 1] = 0;
    
    PasswordHash_GenerateSalt(new_user->passwordSalt, sizeof(new_user->passwordSalt));
    PasswordHash_HashPassword(password, new_user->passwordSalt, new_user->passwordHash, sizeof(new_user->passwordHash));
    
    new_user->role = role;
    new_user->enabled = 1U;
    new_user->createdAt = HAL_GetTick();
    new_user->lastLogin = 0U;
    
    g_users_db_header.userCount++;
    
    /* Пересчитываем CRC и сохраняем */
    g_users_db_header.crc32 = users_db_crc32(&g_users_db_header, g_users_db, g_users_db_header.userCount);
    
    if (save_users_db())
    {
        AppLog("[USERS] Service: Created user %s", username);
        return 1U;
    }
    
    /* Откатываем изменения при ошибке сохранения */
    g_users_db_header.userCount--;
    return 0U;
}

/* Обновление пользователя */
uint8_t UsersService_UpdateUser(const char *username, const char *new_password, user_role_t role, uint8_t enabled)
{
    if (!username || !g_users_db_loaded)
        return 0U;
    
    user_record_t *user = (user_record_t*)UsersService_FindUser(username);
    if (!user)
        return 0U;
    
    /* Обновляем пароль, если указан */
    if (new_password && strlen(new_password) > 0)
    {
        PasswordHash_GenerateSalt(user->passwordSalt, sizeof(user->passwordSalt));
        PasswordHash_HashPassword(new_password, user->passwordSalt, user->passwordHash, sizeof(user->passwordHash));
    }
    
    user->role = role;
    user->enabled = enabled;
    
    /* Пересчитываем CRC и сохраняем */
    g_users_db_header.crc32 = users_db_crc32(&g_users_db_header, g_users_db, g_users_db_header.userCount);
    
    if (save_users_db())
    {
        AppLog("[USERS] Service: Updated user %s", username);
        return 1U;
    }
    
    return 0U;
}

/* Удаление пользователя */
uint8_t UsersService_DeleteUser(const char *username)
{
    if (!username || !g_users_db_loaded)
        return 0U;
    
    /* Находим индекс пользователя */
    uint32_t idx = USERS_MAX_COUNT;
    for (uint32_t i = 0; i < g_users_db_header.userCount; i++)
    {
        if (strcmp(g_users_db[i].username, username) == 0)
        {
            idx = i;
            break;
        }
    }
    
    if (idx >= g_users_db_header.userCount)
        return 0U; /* Пользователь не найден */
    
    /* Сдвигаем массив */
    for (uint32_t i = idx; i < g_users_db_header.userCount - 1; i++)
    {
        g_users_db[i] = g_users_db[i + 1];
    }
    
    g_users_db_header.userCount--;
    memset(&g_users_db[g_users_db_header.userCount], 0, sizeof(user_record_t));
    
    /* Пересчитываем CRC и сохраняем */
    g_users_db_header.crc32 = users_db_crc32(&g_users_db_header, g_users_db, g_users_db_header.userCount);
    
    if (save_users_db())
    {
        AppLog("[USERS] Service: Deleted user %s", username);
        return 1U;
    }
    
    /* Откатываем изменения при ошибке сохранения */
    g_users_db_header.userCount++;
    return 0U;
}

/* Обновление времени последнего входа */
void UsersService_UpdateLastLogin(const char *username)
{
    if (!username || !g_users_db_loaded)
        return;
    
    user_record_t *user = (user_record_t*)UsersService_FindUser(username);
    if (user)
    {
        user->lastLogin = HAL_GetTick();
        /* Не сохраняем в QSPI при каждом входе, только при изменениях */
    }
}

/* Вспомогательная функция для вычисления CRC */
#include "config/users_storage_qspi.h"
