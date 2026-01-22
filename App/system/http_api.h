#pragma once

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Stage 9.3 - REST/HTTP API layer (minimal).
 *
 * Transport (lwIP sockets) lives in http_server.c.
 * This module:
 *  - routes by path
 *  - builds JSON responses without malloc
 *  - calls app services (ConfigService/Journal/Doors)
 *
 * Each handler returns an HTTP status code.
 */

int HttpApi_HandleGet(const char *path, char *out_body, size_t out_sz);

/* PUT is currently used only for a "draft" config upload:
 *  - PUT /api/config
 *
 * On success: returns 200 and JSON body.
 * On validation error: returns 400 and JSON body {"ok":0,"error":"..."}
 */
int HttpApi_HandlePut(const char *path,
                      const char *body, size_t body_len,
                      char *out_body, size_t out_sz);

#ifdef __cplusplus
}
#endif
