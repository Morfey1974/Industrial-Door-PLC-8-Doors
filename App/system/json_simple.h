#pragma once

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* A tiny JSON helper for a controlled schema (embedded).
 *
 * Supported value types:
 *  - unsigned integer: 123
 *  - boolean: true/false
 *  - string: "..." (no escape handling; stops at next quote)
 *  - object: { ... } (brace matching)
 *
 * Not a full JSON parser. Intended for local/LAN dev tools only.
 */

typedef struct {
    const char *ptr;
    size_t len;
} json_span_t;

/* Find a top-level key and return a span for its raw value (trimmed).
 * Example: {"a": 123} -> span="123"
 */
uint8_t Json_FindKeyValueSpan(const char *json, const char *key, json_span_t *out_val);

/* Find an object by key and return span for its inside (without outer braces).
 * Example: {"net":{...}} -> span points to "..." content.
 */
uint8_t Json_FindObjectSpan(const char *json, const char *key, json_span_t *out_obj);

/* Find an array by key and return span for its inside (without [ ]).
 * Example: {"doors":[{...},{...}]} -> span points to "{...},{...}" content.
 */
uint8_t Json_FindArraySpan(const char *json, const char *key, json_span_t *out_arr);

/* Iterate over array of objects. *inout_off is offset into arr_ptr[0..arr_len-1].
 * Skips WS and commas, returns next {...} span. Quote/brace-aware.
 * Returns 1 if found, 0 if no more elements or parse error.
 */
uint8_t Json_ArrayNextObject(const char *arr_ptr, size_t arr_len, size_t *inout_off, json_span_t *out_obj);

uint8_t Json_GetUint32(const char *json, const char *key, uint32_t *out);
uint8_t Json_GetUint16(const char *json, const char *key, uint16_t *out);
uint8_t Json_GetInt(const char *json, const char *key, int *out);
uint8_t Json_GetBool(const char *json, const char *key, uint8_t *out_bool);
uint8_t Json_GetString(const char *json, const char *key, char *out, size_t out_cap);

#ifdef __cplusplus
}
#endif
