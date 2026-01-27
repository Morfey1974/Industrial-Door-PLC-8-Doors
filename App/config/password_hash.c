#include "password_hash.h"
#include <string.h>
#include <stdint.h>

/* =========================================================
 * Простая реализация SHA-256 для хеширования паролей
 * 
 * ВАЖНО: Для production рекомендуется использовать
 * аппаратную реализацию через HAL HASH или оптимизированную библиотеку
 * ========================================================= */

/* Временная реализация: используем простой хеш для отладки
 * TODO: Заменить на полноценную SHA-256 реализацию
 */
static void simple_hash(const uint8_t *data, size_t data_len, const uint8_t *salt, size_t salt_len, uint8_t *out)
{
    /* Простой хеш для отладки: XOR + сдвиги */
    /* В production заменить на SHA-256 */
    uint32_t hash[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
    
    const uint8_t *p = data;
    size_t total_len = data_len + salt_len;
    
    for (size_t i = 0; i < total_len; i++)
    {
        uint8_t byte = (i < data_len) ? p[i] : salt[i - data_len];
        uint32_t idx = i % 8;
        hash[idx] ^= (uint32_t)byte;
        hash[idx] = (hash[idx] << 1) | (hash[idx] >> 31);
        hash[idx] ^= 0x9e3779b9; /* Золотое сечение */
    }
    
    /* Копируем результат */
    for (int i = 0; i < 8; i++)
    {
        out[i * 4 + 0] = (uint8_t)(hash[i] >> 24);
        out[i * 4 + 1] = (uint8_t)(hash[i] >> 16);
        out[i * 4 + 2] = (uint8_t)(hash[i] >> 8);
        out[i * 4 + 3] = (uint8_t)(hash[i]);
    }
}

void PasswordHash_GenerateSalt(uint8_t *salt, size_t salt_len)
{
    if (!salt || salt_len == 0) return;
    
    /* Простая генерация соли на основе HAL_GetTick
     * В production использовать RNG (Random Number Generator)
     */
    extern uint32_t HAL_GetTick(void);
    uint32_t tick = HAL_GetTick();
    
    for (size_t i = 0; i < salt_len; i++)
    {
        salt[i] = (uint8_t)(tick ^ (tick >> 8) ^ (tick >> 16) ^ (tick >> 24));
        tick = (tick << 1) | (tick >> 31);
        tick ^= 0x9e3779b9;
    }
}

void PasswordHash_HashPassword(const char *password, const uint8_t *salt, 
                               uint8_t *hash_out, size_t hash_out_size)
{
    if (!password || !salt || !hash_out || hash_out_size < PASSWORD_HASH_SIZE)
        return;
    
    size_t pwd_len = strlen(password);
    simple_hash((const uint8_t *)password, pwd_len, salt, PASSWORD_SALT_SIZE, hash_out);
}

uint8_t PasswordHash_VerifyPassword(const char *password, const uint8_t *salt,
                                     const uint8_t *stored_hash, size_t hash_size)
{
    if (!password || !salt || !stored_hash || hash_size < PASSWORD_HASH_SIZE)
        return 0U;
    
    uint8_t computed_hash[PASSWORD_HASH_SIZE];
    PasswordHash_HashPassword(password, salt, computed_hash, sizeof(computed_hash));
    
    return (memcmp(computed_hash, stored_hash, PASSWORD_HASH_SIZE) == 0) ? 1U : 0U;
}
