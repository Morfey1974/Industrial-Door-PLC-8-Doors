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

/* request_buf: полный буфер запроса (request-line + headers) для извлечения Authorization.
 * request_len: длина буфера. Для GET передаётся из http_server.
 */
int HttpApi_HandleGet(const char *path, const char *request_buf, int request_len,
                      char *out_body, size_t out_sz);

/* headers/haders_len: заголовки запроса для извлечения Authorization: Bearer <token> */
int HttpApi_HandlePut(const char *path,
                      const char *body, size_t body_len,
                      const char *headers, int headers_len,
                      char *out_body, size_t out_sz);

int HttpApi_HandlePost(const char *path,
                       const char *body, size_t body_len,
                       const char *headers, int headers_len,
                       char *out_body, size_t out_sz);

/* После успешной записи конфигурации (PUT /api/config или /api/config/full)
 * API выставляет флаг. HTTP‑сервер после отправки 200 проверяет его и при
 * необходимости выполняет HAL_NVIC_SystemReset. Сброс очищает флаг. */
int HttpApi_ConfigApplyRequestsReboot(void);
void HttpApi_ClearRebootRequest(void);

/* CORS: разрешённый origin для заголовка Access-Control-Allow-Origin.
 * buf заполняется строкой (например "*" или "http://192.168.1.50:8080"); при пустом конфиге — "*". */
void HttpApi_GetCorsOrigin(char *buf, size_t sz);

#ifdef __cplusplus
}
#endif
