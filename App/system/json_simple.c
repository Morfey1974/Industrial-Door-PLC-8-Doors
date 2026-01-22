#include "json_simple.h"

#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include <stdio.h>

static const char *skip_ws(const char *p)
{
    while (p && (*p == ' ' || *p == "\t"[0] || *p == "\r"[0] || *p == "\n"[0])) {
        p++;
    }
    return p;
}

static void trim_span(json_span_t *s)
{
    if (!s || !s->ptr) return;
    const char *a = s->ptr;
    const char *b = s->ptr + s->len;
    while (a < b && isspace((unsigned char)*a)) a++;
    while (b > a && isspace((unsigned char)*(b - 1))) b--;
    s->ptr = a;
    s->len = (size_t)(b - a);
}

static uint8_t make_key_pattern(const char *key, char *out, size_t out_cap)
{
    if (!key || !out || out_cap < 4U) return 0U;
    const size_t klen = strlen(key);
    if (klen + 3U > out_cap) return 0U;
    out[0] = "\""[0];
    memcpy(&out[1], key, klen);
    out[1 + klen] = "\""[0];
    out[2 + klen] = 0;
    return 1U;
}

uint8_t Json_FindKeyValueSpan(const char *json, const char *key, json_span_t *out_val)
{
    if (!json || !key || !out_val) return 0U;
    out_val->ptr = NULL;
    out_val->len = 0U;
    char pat[64];
    if (!make_key_pattern(key, pat, sizeof(pat))) return 0U;
    const char *p = strstr(json, pat);
    if (!p) return 0U;
    p += strlen(pat);
    /* Find ':' after the key. We deliberately do not attempt full JSON parsing.
     * This helper is used for a small "merge" update payload and expects that
     * keys are unique and not repeated in nested objects with the same name.
     */
    p = strchr(p, ':');
    if (!p) return 0U;
    p++; /* move past ':' */
    p = skip_ws(p);
    if (!p) return 0U;
    const char *start = p;
    if (*start == "\""[0]) {
        start++;
        const char *endq = strchr(start, "\""[0]);
        if (!endq) return 0U;
        out_val->ptr = start;
        out_val->len = (size_t)(endq - start);
        return 1U;
    }
    if (*start == '{') {
        int depth = 0;
        const char *q = start;
        while (*q) {
            if (*q == '{') depth++;
            else if (*q == '}') {
                depth--;
                if (depth == 0) {
                    out_val->ptr = start;
                    out_val->len = (size_t)(q - start + 1);
                    return 1U;
                }
            }
            q++;
        }
        return 0U;
    }
    const char *end = start;
    while (*end) {
        if (*end == ',' || *end == '}' || isspace((unsigned char)*end)) {
            break;
        }
        end++;
    }
    out_val->ptr = start;
    out_val->len = (size_t)(end - start);
    trim_span(out_val);
    return (out_val->len > 0U) ? 1U : 0U;
}

uint8_t Json_FindObjectSpan(const char *json, const char *key, json_span_t *out_obj)
{
    if (!json || !key || !out_obj) return 0U;
    json_span_t raw;
    if (!Json_FindKeyValueSpan(json, key, &raw)) return 0U;
    if (!raw.ptr || raw.len < 2U) return 0U;
    if (raw.ptr[0] != '{') return 0U;
    if (raw.ptr[raw.len - 1U] != '}') return 0U;
    out_obj->ptr = raw.ptr + 1;
    out_obj->len = raw.len - 2U;
    trim_span(out_obj);
    return 1U;
}

static uint8_t parse_u32(json_span_t s, uint32_t *out)
{
    if (!out || !s.ptr || s.len == 0U) return 0U;
    char tmp[24];
    if (s.len >= sizeof(tmp)) return 0U;
    memcpy(tmp, s.ptr, s.len);
    tmp[s.len] = 0;
    char *endp = NULL;
    unsigned long v = strtoul(tmp, &endp, 10);
    if (!endp || endp == tmp) return 0U;
    *out = (uint32_t)v;
    return 1U;
}

uint8_t Json_GetUint32(const char *json, const char *key, uint32_t *out)
{
    json_span_t v;
    if (!Json_FindKeyValueSpan(json, key, &v)) return 0U;
    trim_span(&v);
    return parse_u32(v, out);
}

uint8_t Json_GetUint16(const char *json, const char *key, uint16_t *out)
{
    uint32_t v;
    if (!Json_GetUint32(json, key, &v)) return 0U;
    if (v > 0xFFFFU) return 0U;
    *out = (uint16_t)v;
    return 1U;
}

uint8_t Json_GetBool(const char *json, const char *key, uint8_t *out_bool)
{
    if (!out_bool) return 0U;
    json_span_t v;
    if (!Json_FindKeyValueSpan(json, key, &v)) return 0U;
    trim_span(&v);
    if (v.len == 4U && strncmp(v.ptr, "true", 4) == 0) { *out_bool = 1U; return 1U; }
    if (v.len == 5U && strncmp(v.ptr, "false", 5) == 0) { *out_bool = 0U; return 1U; }
    /* also accept 0/1 */
    uint32_t num;
    if (parse_u32(v, &num) && (num == 0U || num == 1U)) { *out_bool = (uint8_t)num; return 1U; }
    return 0U;
}

uint8_t Json_GetString(const char *json, const char *key, char *out, size_t out_cap)
{
    if (!out || out_cap == 0U) return 0U;
    json_span_t v;
    if (!Json_FindKeyValueSpan(json, key, &v)) return 0U;
    if (!v.ptr) return 0U;
    if (v.len + 1U > out_cap) return 0U;
    memcpy(out, v.ptr, v.len);
    out[v.len] = 0;
    return 1U;
}
