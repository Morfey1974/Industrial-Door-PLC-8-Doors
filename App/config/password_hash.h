#pragma once

#include <stdint.h>
#include <stddef.h>

/* =========================================================
 * Модуль хеширования паролей
 * 
 * Использует SHA-256 с солью для безопасности
 * В будущем можно перейти на аппаратную реализацию через HAL HASH
 * ========================================================= */

/* Размер хеша SHA-256 */
#define PASSWORD_HASH_SIZE 32U

/* Размер соли */
#define PASSWORD_SALT_SIZE 16U

#ifdef __cplusplus
extern "C" {
#endif

/* Генерация случайной соли */
void PasswordHash_GenerateSalt(uint8_t *salt, size_t salt_len);

/* Хеширование пароля с солью: SHA-256(password + salt) */
void PasswordHash_HashPassword(const char *password, const uint8_t *salt, 
                               uint8_t *hash_out, size_t hash_out_size);

/* Проверка пароля */
uint8_t PasswordHash_VerifyPassword(const char *password, const uint8_t *salt,
                                     const uint8_t *stored_hash, size_t hash_size);

#ifdef __cplusplus
}
#endif
