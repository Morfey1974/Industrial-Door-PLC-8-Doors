#include "http_server.h"

#include <string.h>
#include <stdio.h>

#include "lwip/sockets.h"
#include "lwip/inet.h"

#include "cmsis_os.h"

#include "app_log.h"

#include "http_api.h"

/* =========================================================
 * Минимальный сокетный HTTP сервер.
 *
 * Протокол:
 *  - читаем первую строку запроса: "GET /path HTTP/1.1";
 *  - игнорируем заголовки;
 *  - формируем ответ и закрываем соединение.
 *
 * Почему так:
 *  - самый простой надёжный каркас для отладки Ethernet/HTTP (Этап 9);
 *  - легко контролировать время (один клиент за итерацию задачи);
 *  - дальше можно расширять.
 * ========================================================= */

#ifndef HTTP_RX_BUF_SZ
#define HTTP_RX_BUF_SZ 768
#endif

#ifndef HTTP_BODY_MAX
/* Max JSON body size for PUT /api/config (draft merge upload).
 * Keep small to protect RAM and avoid long blocking RX.
 */
#define HTTP_BODY_MAX 2048
#endif

static int s_listen_fd = -1;
static uint16_t s_listen_port = 0;

static void http_send_simple(int fd, int code, const char *ctype, const char *body)
{
    if (!ctype) ctype = "text/plain";
    if (!body) body = "";

    const int body_len = (int)strlen(body);
    
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_SEND
    AppLog("HTTP: send code=%d len=%d type=%s", code, body_len, ctype);
#endif
    char hdr[256];
    const int n = snprintf(hdr, sizeof(hdr),
                           "HTTP/1.1 %d %s\r\n"
                           "Connection: close\r\n"
                           "Content-Type: %s\r\n"
                           "Content-Length: %d\r\n"
                           "Access-Control-Allow-Origin: *\r\n"
                           "Access-Control-Allow-Methods: GET,PUT,OPTIONS\r\n"
                           "Access-Control-Allow-Headers: Content-Type,Authorization\r\n"
                           "\r\n",
                           code,
                           (code == 200) ? "OK" : (code == 404) ? "Not Found" : "Error",
                           ctype,
                           body_len);
    if (n > 0) {
        /* Отправляем заголовок с обработкой частичной отправки и non-blocking режима */
        int sent = 0;
        int attempts = 0;
        const int max_attempts = 100;
        
        while (sent < n && attempts < max_attempts) {
            /* Проверяем готовность сокета к записи перед отправкой заголовка */
            fd_set wfds_hdr;
            FD_ZERO(&wfds_hdr);
            FD_SET(fd, &wfds_hdr);
            struct timeval tv_hdr;
            tv_hdr.tv_sec = 0;
            tv_hdr.tv_usec = 50000; /* 50ms */
            int sel_hdr = lwip_select(fd + 1, NULL, &wfds_hdr, NULL, &tv_hdr);
            
            if (sel_hdr <= 0) {
                attempts++;
                if (attempts < max_attempts) {
                    osDelay(5);
                }
                continue;
            }
            
            int r = lwip_send(fd, hdr + sent, (size_t)(n - sent), 0);
            if (r > 0) {
                sent += r;
                attempts = 0;
            } else if (r == 0) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                AppLog("HTTP: hdr send closed (sent=%d/%d)", sent, n);
#endif
                break; /* Соединение закрыто */
            } else {
                attempts++;
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                if (attempts <= 3) {
                    AppLog("HTTP: hdr send error r=%d (sent=%d/%d)", r, sent, n);
                }
#endif
                if (attempts < max_attempts) {
                    osDelay(5);
                }
            }
        }
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_SEND
        if (sent < n) {
            AppLog("HTTP: hdr send incomplete (sent=%d/%d attempts=%d)", sent, n, attempts);
        } else {
            AppLog("HTTP: hdr sent OK (%d bytes)", sent);
        }
#endif
    }
    
    /* Увеличиваем задержку после отправки заголовка, чтобы дать время TCP стеку
     * обработать заголовок, отправить его клиенту и получить ACK.
     * Это критично для больших ответов, чтобы буфер отправки освободился.
     */
    if (body_len > 0) {
        osDelay(30); /* 30мс задержка для обработки заголовка и освобождения буфера */
    }
    
    if (body_len > 0) {
        /* Отправляем тело с обработкой частичной отправки и non-blocking режима.
         * ВАЖНО: В non-blocking режиме нужно повторять попытки отправки до полной отправки,
         * иначе Content-Length не совпадет с фактически отправленными данными.
         * 
         * Оптимизация для больших ответов:
         * - Уменьшенный размер чанка (128 байт) для лучшей совместимости с TCP буфером
         * - Задержка между чанками для освобождения буфера TCP стека
         * - Увеличенный таймаут select для более терпеливого ожидания
         */
        int sent = 0;
        int attempts = 0;
        int consecutive_errors = 0; /* Счетчик последовательных ошибок */
        const int max_attempts = 200; /* Увеличиваем максимум попыток для больших ответов */
        const int max_consecutive_errors = 50; /* Максимум последовательных ошибок перед паузой */
        
        while (sent < body_len && attempts < max_attempts) {
            /* Проверяем готовность сокета к записи через select */
            fd_set wfds;
            FD_ZERO(&wfds);
            FD_SET(fd, &wfds);
            struct timeval tv_select;
            tv_select.tv_sec = 0;
            tv_select.tv_usec = 100000; /* 100ms таймаут (увеличен для больших ответов) */
            int sel_ready = lwip_select(fd + 1, NULL, &wfds, NULL, &tv_select);
            
            if (sel_ready <= 0) {
                /* Сокет не готов к записи - буфер TCP переполнен или обрабатывается */
                attempts++;
                consecutive_errors++;
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                if (attempts <= 5 || attempts % 20 == 0) {
                    AppLog("HTTP: body socket not ready (attempt=%d sent=%d/%d)", attempts, sent, body_len);
                }
#endif
                /* Если много последовательных ошибок - делаем паузу для освобождения буфера */
                if (consecutive_errors >= max_consecutive_errors) {
                    osDelay(50); /* Пауза 50мс для освобождения буфера TCP */
                    consecutive_errors = 0;
                } else if (attempts < max_attempts) {
                    osDelay(10); /* Обычная задержка 10мс */
                }
                continue;
            }
            
            /* Отправляем небольшими блоками (128 байт) для надежности.
             * Меньший размер чанка снижает риск переполнения буфера TCP.
             */
            size_t chunk_size = (size_t)(body_len - sent);
            if (chunk_size > 128) chunk_size = 128;
            
            int r = lwip_send(fd, body + sent, chunk_size, 0);
            if (r > 0) {
                sent += r;
                attempts = 0; /* Сброс счетчика при успешной отправке */
                consecutive_errors = 0; /* Сброс счетчика ошибок */
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_SEND
                if (sent % 500 == 0 || sent == body_len) {
                    AppLog("HTTP: body progress sent=%d/%d", sent, body_len);
                }
#endif
                /* Небольшая задержка после успешной отправки чанка, чтобы дать время
                 * TCP стеку обработать данные и освободить место в буфере.
                 * Это особенно важно для больших ответов.
                 */
                if (sent < body_len) {
                    osDelay(2); /* 2мс задержка между чанками */
                }
            } else if (r == 0) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                AppLog("HTTP: body send closed (sent=%d/%d)", sent, body_len);
#endif
                /* Соединение закрыто */
                break;
            } else {
                /* Ошибка: lwip_send возвращает отрицательное значение (err_t)
                 * Это может быть EWOULDBLOCK (буфер полон) или другая ошибка.
                 * В любом случае делаем паузу и повторяем попытку.
                 */
                attempts++;
                consecutive_errors++;
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                if (attempts <= 5 || attempts % 20 == 0) {
                    AppLog("HTTP: body send error r=%d (sent=%d/%d attempt=%d)", r, sent, body_len, attempts);
                }
#endif
                /* Если много последовательных ошибок - делаем паузу */
                if (consecutive_errors >= max_consecutive_errors) {
                    osDelay(50); /* Пауза 50мс для освобождения буфера TCP */
                    consecutive_errors = 0;
                } else if (attempts < max_attempts) {
                    osDelay(15); /* Увеличиваем задержку до 15мс при ошибке */
                }
            }
        }
        
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_SEND
        if (sent < body_len) {
            AppLog("HTTP: body send INCOMPLETE! sent=%d/%d attempts=%d", sent, body_len, attempts);
        } else {
            AppLog("HTTP: body sent OK (%d bytes)", sent);
        }
#endif
        
        /* Если не удалось отправить все данные, это проблема, но мы уже указали Content-Length.
         * В этом случае браузер получит ошибку ERR_CONTENT_LENGTH_MISMATCH.
         * Для надежности можно было бы пересчитать Content-Length, но это сложнее.
         */
    }
}

static void http_send_no_body(int fd, int code)
{
    char hdr[256];
    const int n = snprintf(hdr, sizeof(hdr),
                           "HTTP/1.1 %d %s\r\n"
                           "Connection: close\r\n"
                           "Access-Control-Allow-Origin: *\r\n"
                           "Access-Control-Allow-Methods: GET,PUT,OPTIONS\r\n"
                           "Access-Control-Allow-Headers: Content-Type,Authorization\r\n"
                           "Access-Control-Max-Age: 600\r\n"
                           "Content-Length: 0\r\n"
                           "\r\n",
                           code,
                           (code == 204) ? "No Content" : (code == 200) ? "OK" : "Error");
    if (n > 0) {
        /* Отправляем заголовок с обработкой частичной отправки */
        int sent = 0;
        while (sent < n) {
            int r = lwip_send(fd, hdr + sent, (size_t)(n - sent), 0);
            if (r <= 0) break;
            sent += r;
        }
    }
}

static int header_find_content_length(const char *hdr)
{
    if (!hdr) return -1;
    /* naive case-insensitive search */
    const char *p = hdr;
    while (*p) {
        if ((p[0] == 'C' || p[0] == 'c') &&
            (p[1] == 'o' || p[1] == 'O') &&
            (p[2] == 'n' || p[2] == 'N') &&
            (p[3] == 't' || p[3] == 'T') &&
            (p[4] == 'e' || p[4] == 'E') &&
            (p[5] == 'n' || p[5] == 'N') &&
            (p[6] == 't' || p[6] == 'T') &&
            p[7] == '-' &&
            (p[8] == 'L' || p[8] == 'l') &&
            (p[9] == 'e' || p[9] == 'E') &&
            (p[10] == 'n' || p[10] == 'N') &&
            (p[11] == 'g' || p[11] == 'G') &&
            (p[12] == 't' || p[12] == 'T') &&
            (p[13] == 'h' || p[13] == 'H') &&
            p[14] == ':')
        {
            p += 15;
            while (*p == ' ' || *p == '\t') p++;
            int v = 0;
            while (*p >= '0' && *p <= '9') {
                v = (v * 10) + (*p - '0');
                p++;
            }
            return v;
        }
        p++;
    }
    return -1;
}

static uint8_t parse_request_line(const char *line, char *out_method, size_t method_sz,
                                  char *out_path, size_t path_sz)
{
    if (!line || !out_method || !out_path) return 0U;

    /* Простейший парсер: METHOD SP PATH SP HTTP/x.y */
    const char *sp1 = strchr(line, ' ');
    if (!sp1) return 0U;
    const char *sp2 = strchr(sp1 + 1, ' ');
    if (!sp2) return 0U;

    size_t mlen = (size_t)(sp1 - line);
    size_t plen = (size_t)(sp2 - (sp1 + 1));

    if (mlen == 0 || mlen >= method_sz) return 0U;
    if (plen == 0 || plen >= path_sz) return 0U;

    memcpy(out_method, line, mlen);
    out_method[mlen] = 0;

    memcpy(out_path, sp1 + 1, plen);
    out_path[plen] = 0;

    return 1U;
}

void HttpServer_Init(uint16_t port)
{
    s_listen_port = port;

    if (s_listen_fd >= 0) {
        (void)lwip_close(s_listen_fd);
        s_listen_fd = -1;
    }

    s_listen_fd = lwip_socket(AF_INET, SOCK_STREAM, 0);
    if (s_listen_fd < 0) {
        return;
    }

    int opt = 1;
    (void)lwip_setsockopt(s_listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port   = htons(port);
    addr.sin_addr.s_addr = PP_HTONL(INADDR_ANY);

    if (lwip_bind(s_listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        (void)lwip_close(s_listen_fd);
        s_listen_fd = -1;
        return;
    }

    if (lwip_listen(s_listen_fd, 2) < 0) {
        (void)lwip_close(s_listen_fd);
        s_listen_fd = -1;
        return;
    }
}

void HttpServer_PollOnce(uint32_t timeout_ms)
{
    if (s_listen_fd < 0) return;

    /* Ждём accept через select, чтобы не блокировать задачу. */
    fd_set rfds;
    FD_ZERO(&rfds);
    FD_SET(s_listen_fd, &rfds);

    struct timeval tv;
    tv.tv_sec  = (int)(timeout_ms / 1000U);
    tv.tv_usec = (int)((timeout_ms % 1000U) * 1000U);

    int sel = lwip_select(s_listen_fd + 1, &rfds, NULL, NULL, (timeout_ms == 0U) ? NULL : &tv);
    if (sel <= 0) {
        return; /* timeout или ошибка */
    }

    struct sockaddr_in cli;
    socklen_t clilen = sizeof(cli);
    int cfd = lwip_accept(s_listen_fd, (struct sockaddr *)&cli, &clilen);
    if (cfd < 0) {
        return;
    }

    /* Настраиваем сокет как non-blocking и устанавливаем таймауты */
    int flags = 1;
    (void)lwip_ioctl(cfd, FIONBIO, &flags); /* non-blocking mode */

    struct timeval tv_timeout;
    tv_timeout.tv_sec = 0;
    tv_timeout.tv_usec = 200000; /* 200ms таймаут вместо 2 секунд */
    (void)lwip_setsockopt(cfd, SOL_SOCKET, SO_RCVTIMEO, &tv_timeout, sizeof(tv_timeout));
    (void)lwip_setsockopt(cfd, SOL_SOCKET, SO_SNDTIMEO, &tv_timeout, sizeof(tv_timeout));

    /* Ждём готовности данных через select перед recv */
    fd_set rfds_client;
    FD_ZERO(&rfds_client);
    FD_SET(cfd, &rfds_client);
    struct timeval tv_client;
    tv_client.tv_sec = 0;
    tv_client.tv_usec = 100000; /* 100ms таймаут вместо 2 секунд */
    int sel_client = lwip_select(cfd + 1, &rfds_client, NULL, NULL, &tv_client);
    if (sel_client <= 0) {
        (void)lwip_close(cfd);
        return; /* timeout или ошибка */
    }

    /* Читаем начало запроса (request-line + headers + возможно часть body).
     * Для GET это уже достаточно. Для PUT будем дочитывать body по Content-Length.
     */
    char rx[HTTP_RX_BUF_SZ];
    int r = (int)lwip_recv(cfd, rx, sizeof(rx) - 1U, 0);
    if (r <= 0) {
        (void)lwip_close(cfd);
        return;
    }
    rx[r] = 0;

    /* Достаём Request-Line (до \n). */
    char *nl = strchr(rx, '\n');
    if (nl) *nl = 0;
    char *cr = strchr(rx, '\r');
    if (cr) *cr = 0;

    char method[8];
    char path[96];
    if (!parse_request_line(rx, method, sizeof(method), path, sizeof(path))) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
        AppLog("HTTP: bad request line: %s", rx);
#endif
        http_send_simple(cfd, 400, "text/plain", "Bad Request\n");
        (void)lwip_close(cfd);
        return;
    }

#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_REQUESTS
    AppLog("HTTP: %s %s", method, path);
#endif

    /* CORS preflight */
    if (strcmp(method, "OPTIONS") == 0) {
        http_send_no_body(cfd, 204);
        (void)lwip_close(cfd);
        return;
    }

    if (strcmp(method, "GET") == 0) {
        /* API GET */
        /* Увеличиваем буфер для ответов, особенно для /api/doors с 8 дверьми */
        char body[4096];
        memset(body, 0, sizeof(body)); /* ВАЖНО: инициализируем нулями для корректного strlen() */
        
        /* Защита от зависания: устанавливаем общий таймаут на обработку запроса.
         * Если обработка занимает больше 500мс, закрываем соединение.
         */
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
        AppLog("HTTP: building response for %s", path);
#endif
        const int api_code = HttpApi_HandleGet(path, body, sizeof(body));
        
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
        const int body_len_check = (int)strlen(body);
        AppLog("HTTP: response code=%d body_len=%d", api_code, body_len_check);
        if (body_len_check > 0 && body_len_check < 100) {
            AppLog("HTTP: body preview: %.80s", body);
        }
#endif
        
        if (api_code == 200) {
            http_send_simple(cfd, 200, "application/json", body);
        } else if (api_code == 404) {
            if (strcmp(path, "/") == 0) {
                http_send_simple(cfd, 200, "text/plain", "Industrial Door PLC HTTP OK\n");
            } else {
                http_send_simple(cfd, 404, "text/plain", "Not Found\n");
            }
        } else {
            http_send_simple(cfd, 500, "text/plain", "Internal Error\n");
        }
        (void)lwip_close(cfd);
        return;
    }

    if (strcmp(method, "PUT") == 0) {
        /* For PUT we need body. Find end of headers in the original rx buffer.
         * Note: we truncated rx at first newline to parse request-line, but only
         * by inserting a 0 at that position; the rest of rx (headers) is intact.
         */
        const char *hdr_start = rx;
        const char *hdr_end = strstr(hdr_start, "\r\n\r\n");
        int hdr_end_len = 4;
        if (!hdr_end) {
            hdr_end = strstr(hdr_start, "\n\n");
            hdr_end_len = 2;
        }
        if (!hdr_end) {
            http_send_simple(cfd, 400, "text/plain", "Bad Headers\n");
            (void)lwip_close(cfd);
            return;
        }

        const int content_len = header_find_content_length(hdr_start);
        if (content_len < 0) {
            http_send_simple(cfd, 411, "text/plain", "Length Required\n");
            (void)lwip_close(cfd);
            return;
        }
        if ((uint32_t)content_len > (HTTP_BODY_MAX - 1U)) {
            http_send_simple(cfd, 413, "text/plain", "Payload Too Large\n");
            (void)lwip_close(cfd);
            return;
        }

        char req_body[HTTP_BODY_MAX];
        memset(req_body, 0, sizeof(req_body));

        const char *body_start = hdr_end + hdr_end_len;
        const int already = (int)((rx + r) - body_start);
        int copied = 0;
        if (already > 0) {
            copied = already;
            if (copied > content_len) copied = content_len;
            memcpy(req_body, body_start, (size_t)copied);
        }

        while (copied < content_len) {
            const int need = content_len - copied;
            const int chunk = (need > 256) ? 256 : need;
            int rr = (int)lwip_recv(cfd, &req_body[copied], (size_t)chunk, 0);
            if (rr <= 0) break;
            copied += rr;
        }
        if (copied != content_len) {
            http_send_simple(cfd, 400, "text/plain", "Bad Body\n");
            (void)lwip_close(cfd);
            return;
        }

        char resp[768];
        const int api_code = HttpApi_HandlePut(path, req_body, (size_t)content_len, resp, sizeof(resp));
        if (api_code == 200) {
            http_send_simple(cfd, 200, "application/json", resp);
        } else if (api_code == 400) {
            http_send_simple(cfd, 400, "application/json", resp);
        } else if (api_code == 404) {
            http_send_simple(cfd, 404, "text/plain", "Not Found\n");
        } else {
            /* default */
            http_send_simple(cfd, 500, "application/json", resp);
        }

        (void)lwip_close(cfd);
        return;
    }

    http_send_simple(cfd, 405, "text/plain", "Method Not Allowed\n");

    (void)lwip_close(cfd);
}
