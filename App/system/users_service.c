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

/* Структура для хранения токенов восстановления пароля */
#define RESET_TOKEN_MAX_COUNT 10U
#define RESET_TOKEN_LEN 32U
#define RESET_TOKEN_EXPIRY_MS (15U * 60U * 1000U) /* 15 минут */

typedef struct {
    char token[RESET_TOKEN_LEN + 1];
    char username[USERNAME_MAX_LEN];
    uint32_t expiresAt; /* HAL_GetTick() + RESET_TOKEN_EXPIRY_MS */
    uint8_t used; /* 1 = использован, 0 = активен */
} reset_token_t;

static reset_token_t g_reset_tokens[RESET_TOKEN_MAX_COUNT];
static uint32_t g_reset_token_count = 0U;

/* Генерация токена восстановления пароля */
uint8_t UsersService_GenerateResetToken(const char *username, char *out_token, size_t token_size)
{
    if (!username || !out_token || token_size < RESET_TOKEN_LEN + 1 || !g_users_db_loaded)
        return 0U;
    
    /* Проверяем, существует ли пользователь */
    if (UsersService_FindUser(username) == NULL)
        return 0U;
    
    /* Ищем свободный слот или перезаписываем старый токен для этого пользователя */
    uint32_t slot = RESET_TOKEN_MAX_COUNT;
    uint32_t now = HAL_GetTick();
    
    /* Сначала ищем существующий неиспользованный токен для этого пользователя */
    for (uint32_t i = 0; i < g_reset_token_count; i++)
    {
        if (!g_reset_tokens[i].used && 
            strcmp(g_reset_tokens[i].username, username) == 0 &&
            g_reset_tokens[i].expiresAt > now)
        {
            slot = i;
            break;
        }
    }
    
    /* Если не нашли, ищем свободный слот или перезаписываем истекший */
    if (slot >= RESET_TOKEN_MAX_COUNT)
    {
        for (uint32_t i = 0; i < RESET_TOKEN_MAX_COUNT; i++)
        {
            if (g_reset_tokens[i].used || g_reset_tokens[i].expiresAt <= now)
            {
                slot = i;
                break;
            }
        }
    }
    
    if (slot >= RESET_TOKEN_MAX_COUNT)
        return 0U; /* Нет свободных слотов */
    
    /* Генерируем токен на основе username + текущего времени + случайных данных */
    uint32_t tick = HAL_GetTick();
    char temp[64];
    (void)snprintf(temp, sizeof(temp), "%s_%lu_%lu", username, (unsigned long)tick, (unsigned long)(tick ^ 0x12345678));
    
    /* Простой хеш для токена */
    uint32_t hash = 0;
    for (size_t i = 0; temp[i] && i < sizeof(temp) - 1; i++)
    {
        hash = (hash << 5) - hash + (uint32_t)temp[i];
    }
    
    /* Формируем токен в hex формате */
    (void)snprintf(g_reset_tokens[slot].token, sizeof(g_reset_tokens[slot].token), 
                   "%08lx%08lx", (unsigned long)hash, (unsigned long)(tick ^ hash));
    
    (void)strncpy(g_reset_tokens[slot].username, username, sizeof(g_reset_tokens[slot].username) - 1);
    g_reset_tokens[slot].username[sizeof(g_reset_tokens[slot].username) - 1] = 0;
    g_reset_tokens[slot].expiresAt = now + RESET_TOKEN_EXPIRY_MS;
    g_reset_tokens[slot].used = 0U;
    
    if (slot >= g_reset_token_count)
        g_reset_token_count = slot + 1;
    
    (void)strncpy(out_token, g_reset_tokens[slot].token, token_size - 1);
    out_token[token_size - 1] = 0;
    
    AppLog("[USERS] Service: Generated reset token for %s", username);
    return 1U;
}

/* Сброс пароля по токену */
uint8_t UsersService_ResetPasswordByToken(const char *token, const char *new_password)
{
    if (!token || !new_password || !g_users_db_loaded)
        return 0U;
    
    /* Валидация нового пароля */
    size_t pwd_len = strlen(new_password);
    if (pwd_len < 8 || pwd_len > 64)
        return 0U;
    
    /* Ищем токен */
    uint32_t now = HAL_GetTick();
    uint32_t slot = RESET_TOKEN_MAX_COUNT;
    
    for (uint32_t i = 0; i < g_reset_token_count; i++)
    {
        if (!g_reset_tokens[i].used &&
            strcmp(g_reset_tokens[i].token, token) == 0 &&
            g_reset_tokens[i].expiresAt > now)
        {
            slot = i;
            break;
        }
    }
    
    if (slot >= RESET_TOKEN_MAX_COUNT)
        return 0U; /* Токен не найден или истек */
    
    /* Сбрасываем пароль */
    const char *username = g_reset_tokens[slot].username;
    user_record_t *user = (user_record_t*)UsersService_FindUser(username);
    if (!user)
        return 0U;
    
    /* Обновляем пароль */
    PasswordHash_GenerateSalt(user->passwordSalt, sizeof(user->passwordSalt));
    PasswordHash_HashPassword(new_password, user->passwordSalt, user->passwordHash, sizeof(user->passwordHash));
    
    /* Пересчитываем CRC и сохраняем */
    g_users_db_header.crc32 = users_db_crc32(&g_users_db_header, g_users_db, g_users_db_header.userCount);
    
    if (!save_users_db())
        return 0U;
    
    /* Помечаем токен как использованный */
    g_reset_tokens[slot].used = 1U;
    
    AppLog("[USERS] Service: Password reset for %s via token", username);
    return 1U;
}

/* =========================================================
 * Сессии API (токен после логина)
 * Хранятся в RAM, срок жизни 24 ч
 * ========================================================= */
#define SESSION_TOKEN_MAX 32U
#define SESSION_MAX_COUNT 16U
#define SESSION_EXPIRY_MS (24U * 60U * 60U * 1000U) /* 24 часа */

typedef struct {
    char token[SESSION_TOKEN_MAX];
    char username[USERNAME_MAX_LEN];
    uint32_t expiry;
} session_entry_t;

static session_entry_t g_sessions[SESSION_MAX_COUNT];
static uint32_t g_session_counter = 0U;

uint8_t UsersService_SessionCreate(const char *username, char *out_token, size_t token_size)
{
    if (!username || !out_token || token_size < 22U)
        return 0U;
    
    uint32_t now = HAL_GetTick();
    uint32_t slot = SESSION_MAX_COUNT;
    
    /* Ищем свободный слот или истекшую сессию */
    for (uint32_t i = 0; i < SESSION_MAX_COUNT; i++)
    {
        if (g_sessions[i].expiry <= now || g_sessions[i].token[0] == 0)
        {
            slot = i;
            break;
        }
    }
    
    if (slot >= SESSION_MAX_COUNT)
        return 0U;
    
    g_session_counter++;
    (void)snprintf(g_sessions[slot].token, sizeof(g_sessions[slot].token),
                  "sess_%08lx%08lx", (unsigned long)now, (unsigned long)g_session_counter);
    (void)strncpy(g_sessions[slot].username, username, sizeof(g_sessions[slot].username) - 1);
    g_sessions[slot].username[sizeof(g_sessions[slot].username) - 1] = 0;
    g_sessions[slot].expiry = now + SESSION_EXPIRY_MS;
    
    (void)strncpy(out_token, g_sessions[slot].token, token_size - 1);
    out_token[token_size - 1] = 0;
    
    AppLog("[USERS] Session created for %s", username);
    return 1U;
}

uint8_t UsersService_SessionValidate(const char *token, char *out_username, size_t username_size)
{
    if (!token || token[0] == 0)
        return 0U;
    
    uint32_t now = HAL_GetTick();
    
    for (uint32_t i = 0; i < SESSION_MAX_COUNT; i++)
    {
        if (g_sessions[i].token[0] != 0 &&
            g_sessions[i].expiry > now &&
            strcmp(g_sessions[i].token, token) == 0)
        {
            if (out_username && username_size > 0)
            {
                (void)strncpy(out_username, g_sessions[i].username, username_size - 1);
                out_username[username_size - 1] = 0;
            }
            return 1U;
        }
    }
    return 0U;
}

/* Вспомогательная функция для вычисления CRC */
#include "config/users_storage_qspi.h"
