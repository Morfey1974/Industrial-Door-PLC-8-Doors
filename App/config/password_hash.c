/*
 * Хеширование паролей: SHA-256(password || salt).
 * Поддержка старого формата (simple_hash) для входа после обновления прошивки.
 */

#include "password_hash.h"
#include "secure_random.h"
#include <string.h>
#include <stdint.h>

/* Старый формат хеша (до перехода на SHA-256): для миграции — при совпадении старый вход разрешён */
static void legacy_simple_hash(const uint8_t *data, size_t data_len, const uint8_t *salt, size_t salt_len, uint8_t *out)
{
	uint32_t hash[8] = { 0x6a09e667U, 0xbb67ae85U, 0x3c6ef372U, 0xa54ff53aU,
	                     0x510e527fU, 0x9b05688cU, 0x1f83d9abU, 0x5be0cd19U };
	const uint8_t *p = data;
	size_t total_len = data_len + salt_len;
	for (size_t i = 0; i < total_len; i++) {
		uint8_t byte = (i < data_len) ? p[i] : salt[i - data_len];
		uint32_t idx = (uint32_t)(i % 8);
		hash[idx] ^= (uint32_t)byte;
		hash[idx] = (hash[idx] << 1) | (hash[idx] >> 31);
		hash[idx] ^= 0x9e3779b9U;
	}
	for (int i = 0; i < 8; i++) {
		out[i * 4 + 0] = (uint8_t)(hash[i] >> 24);
		out[i * 4 + 1] = (uint8_t)(hash[i] >> 16);
		out[i * 4 + 2] = (uint8_t)(hash[i] >> 8);
		out[i * 4 + 3] = (uint8_t)hash[i];
	}
}

/* Размер блока и состояния SHA-256 */
#define SHA256_BLOCK_SIZE  64
#define SHA256_STATE_WORDS 8

typedef struct {
	uint32_t state[SHA256_STATE_WORDS];
	uint8_t buffer[SHA256_BLOCK_SIZE];
	uint32_t buffer_len;
	uint64_t total_bits;
} sha256_ctx_t;

static uint32_t rotr32(uint32_t x, int n)
{
	return (x >> n) | (x << (32 - n));
}

static const uint32_t K[64] = {
	0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U,
	0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
	0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U,
	0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
	0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU,
	0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
	0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U,
	0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
	0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U,
	0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
	0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U,
	0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
	0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U,
	0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
	0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U,
	0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U,
};

static void sha256_block(sha256_ctx_t *ctx)
{
	uint32_t *S = ctx->state;
	uint32_t W[64];
	size_t i;

	for (i = 0; i < 16; i++) {
		W[i] = ((uint32_t)ctx->buffer[i*4] << 24) |
		       ((uint32_t)ctx->buffer[i*4+1] << 16) |
		       ((uint32_t)ctx->buffer[i*4+2] << 8) |
		       (uint32_t)ctx->buffer[i*4+3];
	}
	for (i = 16; i < 64; i++) {
		uint32_t s0 = rotr32(W[i-15], 7) ^ rotr32(W[i-15], 18) ^ (W[i-15] >> 3);
		uint32_t s1 = rotr32(W[i-2], 17) ^ rotr32(W[i-2], 19) ^ (W[i-2] >> 10);
		W[i] = W[i-16] + s0 + W[i-7] + s1;
	}

	uint32_t a = S[0], b = S[1], c = S[2], d = S[3];
	uint32_t e = S[4], f = S[5], g = S[6], h = S[7];

	for (i = 0; i < 64; i++) {
		uint32_t S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
		uint32_t ch = (e & f) ^ ((~e) & g);
		uint32_t t1 = h + S1 + ch + K[i] + W[i];
		uint32_t S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
		uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
		uint32_t t2 = S0 + maj;

		h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
	}

	S[0] += a; S[1] += b; S[2] += c; S[3] += d;
	S[4] += e; S[5] += f; S[6] += g; S[7] += h;
}

static void sha256_init(sha256_ctx_t *ctx)
{
	ctx->state[0] = 0x6a09e667U;
	ctx->state[1] = 0xbb67ae85U;
	ctx->state[2] = 0x3c6ef372U;
	ctx->state[3] = 0xa54ff53aU;
	ctx->state[4] = 0x510e527fU;
	ctx->state[5] = 0x9b05688cU;
	ctx->state[6] = 0x1f83d9abU;
	ctx->state[7] = 0x5be0cd19U;
	ctx->buffer_len = 0;
	ctx->total_bits = 0;
}

static void sha256_update(sha256_ctx_t *ctx, const uint8_t *data, size_t len)
{
	ctx->total_bits += (uint64_t)len * 8U;
	while (len) {
		size_t take = SHA256_BLOCK_SIZE - ctx->buffer_len;
		if (take > len) take = len;
		memcpy(ctx->buffer + ctx->buffer_len, data, take);
		ctx->buffer_len += (uint32_t)take;
		data += take;
		len -= take;
		if (ctx->buffer_len == SHA256_BLOCK_SIZE) {
			sha256_block(ctx);
			ctx->buffer_len = 0;
		}
	}
}

static void sha256_final(sha256_ctx_t *ctx, uint8_t *out32)
{
	uint64_t bits = ctx->total_bits;
	uint32_t i;

	ctx->buffer[ctx->buffer_len++] = 0x80U;
	while (ctx->buffer_len != 56 && ctx->buffer_len != SHA256_BLOCK_SIZE) {
		if (ctx->buffer_len == SHA256_BLOCK_SIZE) {
			sha256_block(ctx);
			ctx->buffer_len = 0;
		}
		ctx->buffer[ctx->buffer_len++] = 0U;
	}
	if (ctx->buffer_len > 56) {
		while (ctx->buffer_len < SHA256_BLOCK_SIZE) ctx->buffer[ctx->buffer_len++] = 0U;
		sha256_block(ctx);
		ctx->buffer_len = 0;
	}
	while (ctx->buffer_len < 56) ctx->buffer[ctx->buffer_len++] = 0U;
	/* Длина в битах, big-endian, последние 8 байт блока */
	ctx->buffer[56] = (uint8_t)(bits >> 56);
	ctx->buffer[57] = (uint8_t)(bits >> 48);
	ctx->buffer[58] = (uint8_t)(bits >> 40);
	ctx->buffer[59] = (uint8_t)(bits >> 32);
	ctx->buffer[60] = (uint8_t)(bits >> 24);
	ctx->buffer[61] = (uint8_t)(bits >> 16);
	ctx->buffer[62] = (uint8_t)(bits >> 8);
	ctx->buffer[63] = (uint8_t)bits;
	sha256_block(ctx);

	for (i = 0; i < 8; i++) {
		out32[i*4 + 0] = (uint8_t)(ctx->state[i] >> 24);
		out32[i*4 + 1] = (uint8_t)(ctx->state[i] >> 16);
		out32[i*4 + 2] = (uint8_t)(ctx->state[i] >> 8);
		out32[i*4 + 3] = (uint8_t)ctx->state[i];
	}
}

void PasswordHash_GenerateSalt(uint8_t *salt, size_t salt_len)
{
	if (!salt || salt_len == 0) return;
	SecureRandom_Fill(salt, salt_len);
}

void PasswordHash_HashPassword(const char *password, const uint8_t *salt,
                               uint8_t *hash_out, size_t hash_out_size)
{
	if (!password || !salt || !hash_out || hash_out_size < PASSWORD_HASH_SIZE)
		return;

	size_t pwd_len = strlen(password);
	sha256_ctx_t ctx;

	sha256_init(&ctx);
	sha256_update(&ctx, (const uint8_t *)password, pwd_len);
	sha256_update(&ctx, salt, PASSWORD_SALT_SIZE);
	sha256_final(&ctx, hash_out);
}

uint8_t PasswordHash_VerifyPassword(const char *password, const uint8_t *salt,
                                    const uint8_t *stored_hash, size_t hash_size)
{
	if (!password || !salt || !stored_hash || hash_size < PASSWORD_HASH_SIZE)
		return 0U;

	uint8_t computed[PASSWORD_HASH_SIZE];
	PasswordHash_HashPassword(password, salt, computed, sizeof(computed));
	if (memcmp(computed, stored_hash, PASSWORD_HASH_SIZE) == 0)
		return 1U;
	/* Миграция: пользователи, созданные до перехода на SHA-256, хранят старый хеш */
	legacy_simple_hash((const uint8_t *)password, strlen(password), salt, PASSWORD_SALT_SIZE, computed);
	return (memcmp(computed, stored_hash, PASSWORD_HASH_SIZE) == 0) ? 1U : 0U;
}
