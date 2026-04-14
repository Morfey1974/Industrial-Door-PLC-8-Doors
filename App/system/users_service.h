#pragma once

#include <stdint.h>
/* Относительно App/system — см. комментарий в config_service.h */
#include "../config/users_format.h"

/* =========================================================
 * Сервис управления пользователями
 * 
 * Загружает базу пользователей из QSPI при старте
 * Предоставляет API для работы с пользователями
 * ========================================================= */

#ifdef __cplusplus
extern "C" {
#endif

/* Инициализация сервиса (загрузка базы из QSPI) */
uint8_t UsersService_Init(void);

/* Поиск пользователя по имени */
const user_record_t* UsersService_FindUser(const char *username);

/* Проверка пароля пользователя */
uint8_t UsersService_VerifyPassword(const char *username, const char *password);

/* Получение роли пользователя */
user_role_t UsersService_GetUserRole(const char *username);

/* Получение всех пользователей (для API) */
uint8_t UsersService_GetAllUsers(user_record_t *out_users, size_t max_users, uint32_t *out_count);

/* Создание нового пользователя */
uint8_t UsersService_CreateUser(const char *username, const char *password, user_role_t role);

/* Обновление пользователя */
uint8_t UsersService_UpdateUser(const char *username, const char *new_password, user_role_t role, uint8_t enabled);

/* Удаление пользователя */
uint8_t UsersService_DeleteUser(const char *username);

/* Обновление времени последнего входа */
void UsersService_UpdateLastLogin(const char *username);

/* Генерация токена восстановления пароля (только для Super Admin) */
uint8_t UsersService_GenerateResetToken(const char *username, char *out_token, size_t token_size);

/* Сброс пароля по токену */
uint8_t UsersService_ResetPasswordByToken(const char *token, const char *new_password);

/* Сессии (токен после логина для проверки доступа к API) */
uint8_t UsersService_SessionCreate(const char *username, char *out_token, size_t token_size);
uint8_t UsersService_SessionValidate(const char *token, char *out_username, size_t username_size);

#ifdef __cplusplus
}
#endif
