#include "http_server.h"

#include <errno.h>
#include <string.h>
#include <stdio.h>

#include "lwip/sockets.h"
#include "lwip/inet.h"

#include "cmsis_os.h"

#include "app_log.h"

#include "http_api.h"
#include "stm32h7xx_hal.h"

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
/* Обычные PUT (merge и т.д.) — буфер на стеке httpTask. */
#define HTTP_BODY_MAX 8192
#endif

/* PUT /api/config/full: JSON 40 дверей + рёбра + таймауты > 8 КБ — отдельный статический буфер
 * (не на стеке: стек httpTask 16 КБ, целиком 32 КБ туда не положить). */
#ifndef HTTP_CONFIG_PUT_MAX
#define HTTP_CONFIG_PUT_MAX 32768
#endif

static char s_put_config_full_body[HTTP_CONFIG_PUT_MAX];

/* Буфер тела ответа для GET (в т.ч. /api/config/full). */
#ifndef HTTP_GET_RESPONSE_MAX
#define HTTP_GET_RESPONSE_MAX 8192
#endif

static int s_listen_fd = -1;
static uint16_t s_listen_port = 0;

void HttpServer_Deinit(void)
{
    /* Закрываем listen-сокет, чтобы при возврате линка можно было
     * безопасно поднять сервер заново без перезапуска контроллера.
     * shutdown перед close ускоряет освобождение локального порта в lwIP.
     */
    if (s_listen_fd >= 0) {
        (void)lwip_shutdown(s_listen_fd, SHUT_RDWR);
        (void)lwip_close(s_listen_fd);
        s_listen_fd = -1;
    }
}

uint8_t HttpServer_IsReady(void)
{
    return (s_listen_fd >= 0) ? 1U : 0U;
}

static void http_send_simple(int fd, int code, const char *ctype, const char *body)
{
    if (!ctype) ctype = "text/plain";
    if (!body) body = "";

    const int body_len = (int)strlen(body);

    char cors_origin[80];
    HttpApi_GetCorsOrigin(cors_origin, sizeof(cors_origin));

#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_SEND
    AppLog("HTTP: send code=%d len=%d type=%s", code, body_len, ctype);
#endif
    char hdr[320];
    const int n = snprintf(hdr, sizeof(hdr),
                           "HTTP/1.1 %d %s\r\n"
                           "Connection: close\r\n"
                           "Content-Type: %s\r\n"
                           "Content-Length: %d\r\n"
                           "Access-Control-Allow-Origin: %s\r\n"
                           "Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS\r\n"
                           "Access-Control-Allow-Headers: Content-Type,Authorization,X-Client-Time\r\n"
                           "\r\n",
                           code,
                           (code == 200) ? "OK" : (code == 404) ? "Not Found" : "Error",
                           ctype,
                           body_len,
                           cors_origin);
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
        osDelay(50); /* 50мс после заголовка: дать TCP отправить его и освободить буфер */
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
        int consecutive_errors = 0;
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_SEND
        int last_body_errno = 0; /* последний errno при send error для диагностики INCOMPLETE */
#endif
        const int max_attempts = 400; /* больше попыток (≈6 с при 15 ms) для устойчивости */
        const int max_consecutive_errors = 50;
        
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
                /* Ошибка: lwip_send возвращает -1, errno указывает причину
                 * (например EAGAIN/EWOULDBLOCK, ECONNRESET, ENOTCONN).
                 */
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_SEND
                last_body_errno = errno;
#endif
                attempts++;
                consecutive_errors++;
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                if (attempts <= 5 || attempts % 20 == 0) {
                    AppLog("HTTP: body send error r=%d errno=%d (sent=%d/%d attempt=%d)", r, last_body_errno, sent, body_len, attempts);
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
            AppLog("HTTP: body send INCOMPLETE! sent=%d/%d attempts=%d errno=%d", sent, body_len, attempts, last_body_errno);
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
    char cors_origin[80];
    HttpApi_GetCorsOrigin(cors_origin, sizeof(cors_origin));

    char hdr[320];
    const int n = snprintf(hdr, sizeof(hdr),
                           "HTTP/1.1 %d %s\r\n"
                           "Connection: close\r\n"
                           "Access-Control-Allow-Origin: %s\r\n"
                           "Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS\r\n"
                           "Access-Control-Allow-Headers: Content-Type,Authorization,X-Client-Time\r\n"
                           "Access-Control-Max-Age: 600\r\n"
                           "Content-Length: 0\r\n"
                           "\r\n",
                           code,
                           (code == 204) ? "No Content" : (code == 200) ? "OK" : "Error",
                           cors_origin);
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

    /* На re-init всегда начинаем с "чистого" состояния сокета. */
    HttpServer_Deinit();

    s_listen_fd = lwip_socket(AF_INET, SOCK_STREAM, 0);
    if (s_listen_fd < 0) {
        /* Всегда в лог: без этого после link flap «тишина», а WebUI не подключается. */
        AppLog("HTTP: socket() failed errno=%d", errno);
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
        AppLog("HTTP: bind(%u) failed errno=%d", (unsigned)port, errno);
        (void)lwip_close(s_listen_fd);
        s_listen_fd = -1;
        return;
    }

    if (lwip_listen(s_listen_fd, 2) < 0) {
        AppLog("HTTP: listen() failed errno=%d", errno);
        (void)lwip_close(s_listen_fd);
        s_listen_fd = -1;
        return;
    }

    AppLog("HTTP: listen OK port=%u fd=%d", (unsigned)port, s_listen_fd);
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
        /* При ошибке select (sel < 0) сервер может остаться в "битом" состоянии
         * после link flap. Закрываем listen-сокет, чтобы HttpTask сделал re-init.
         */
        if (sel < 0) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
            AppLog("HTTP: select(listen) error errno=%d -> deinit", errno);
#endif
            HttpServer_Deinit();
        }
        return; /* timeout или ошибка */
    }

    struct sockaddr_in cli;
    socklen_t clilen = sizeof(cli);
    int cfd = lwip_accept(s_listen_fd, (struct sockaddr *)&cli, &clilen);
    if (cfd < 0) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
        AppLog("HTTP: accept() failed errno=%d", errno);
#endif
        return;
    }

    /* Настраиваем сокет как non-blocking и устанавливаем таймауты */
    int flags = 1;
    (void)lwip_ioctl(cfd, FIONBIO, &flags); /* non-blocking mode */

    struct timeval tv_timeout;
    /* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: увеличен таймаут сокета для поддержки больших конфигураций
     * 
     * Проблема: при конфигурации на 12+ дверей JSON может быть >3000 байт.
     * Таймаут 200ms может быть слишком коротким для чтения больших запросов,
     * особенно при медленной сети или задержках.
     * 
     * Решение: увеличен таймаут до 2 секунд для поддержки больших запросов.
     * Это не блокирует задачу, так как мы используем select с меньшими таймаутами
     * для проверки готовности сокета.
     */
    tv_timeout.tv_sec = 2;
    tv_timeout.tv_usec = 0; /* 2 секунды таймаут для больших запросов */
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

    /* Достаём Request-Line (до \n). 
     * ВАЖНО: Сохраняем указатель на начало заголовков и восстанавливаем \n после парсинга,
     * чтобы strstr мог найти конец заголовков в исходном буфере.
     */
    char *nl = strchr(rx, '\n');
    const char *hdr_start_orig = NULL; /* Сохраняем указатель на начало заголовков */
    char saved_nl = 0;
    char saved_cr = 0;
    
    if (nl) {
        hdr_start_orig = nl + 1; /* Начало заголовков - после первого \n */
        saved_nl = *nl; /* Сохраняем оригинальный символ */
        *nl = 0; /* Обрезаем request-line для парсинга */
    }
    char *cr = strchr(rx, '\r');
    if (cr) {
        saved_cr = *cr;
        *cr = 0;
    }

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
    
    /* Восстанавливаем символы для поиска заголовков в PUT запросах */
    if (nl) *nl = saved_nl;
    if (cr) *cr = saved_cr;

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
        char body[HTTP_GET_RESPONSE_MAX];
        memset(body, 0, sizeof(body));
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
        AppLog("HTTP: building response for %s", path);
#endif
        const int api_code = HttpApi_HandleGet(path, rx, r, body, sizeof(body));
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
        const int body_len_check = (int)strlen(body);
        AppLog("HTTP: response code=%d body_len=%d", api_code, body_len_check);
        if (body_len_check > 0 && body_len_check < 100) {
            AppLog("HTTP: body preview: %.80s", body);
        }
#endif
        if (api_code == 200) {
            http_send_simple(cfd, 200, "application/json", body);
        } else if (api_code == 401) {
            http_send_simple(cfd, 401, "application/json", body);
        } else if (api_code == 404) {
            if (strcmp(path, "/") == 0) {
                http_send_simple(cfd, 200, "text/plain", "Industrial Door PLC HTTP OK\n");
            } else {
                http_send_simple(cfd, 404, "text/plain", "Not Found\n");
            }
        } else {
            if (body[0] == '{' && strstr(body, "errorMsg") != NULL) {
                http_send_simple(cfd, 500, "application/json", body);
            } else {
                http_send_simple(cfd, 500, "text/plain", "Internal Error\n");
            }
        }
        (void)lwip_close(cfd);
        return;
    }

    if (strcmp(method, "PUT") == 0) {
        /* For PUT we need body. Find end of headers in the original rx buffer.
         * ИСПРАВЛЕНИЕ: hdr_start должен указывать на начало заголовков (после request-line),
         * а не на начало обрезанного буфера rx. После восстановления \n и \r, strstr может
         * правильно найти конец заголовков в исходном буфере.
         */
        if (!hdr_start_orig) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
            AppLog("HTTP: PUT Bad Headers - no header start found");
#endif
            http_send_simple(cfd, 400, "text/plain", "Bad Headers\n");
            (void)lwip_close(cfd);
            return;
        }
        
        const char *hdr_start = hdr_start_orig;
        const char *hdr_end = strstr(hdr_start, "\r\n\r\n");
        int hdr_end_len = 4;
        if (!hdr_end) {
            hdr_end = strstr(hdr_start, "\n\n");
            hdr_end_len = 2;
        }
        if (!hdr_end) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
            AppLog("HTTP: PUT Bad Headers - cannot find header end. rx_len=%d, hdr_start=%p", r, (void*)hdr_start);
            if (r < 200 && hdr_start) {
                AppLog("HTTP: hdr_start preview: %.200s", hdr_start);
            }
#endif
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
        const uint8_t is_put_cfg_full = (strcmp(path, "/api/config/full") == 0) ? 1U : 0U;

        char stack_put_body[HTTP_BODY_MAX];
        char *req_body;
        int body_buf_sz;

        if (is_put_cfg_full) {
            if (content_len >= HTTP_CONFIG_PUT_MAX) {
                http_send_simple(cfd, 413, "text/plain", "Payload Too Large\n");
                (void)lwip_close(cfd);
                return;
            }
            req_body = s_put_config_full_body;
            body_buf_sz = HTTP_CONFIG_PUT_MAX;
        } else {
            if ((uint32_t)content_len > (HTTP_BODY_MAX - 1U)) {
                http_send_simple(cfd, 413, "text/plain", "Payload Too Large\n");
                (void)lwip_close(cfd);
                return;
            }
            req_body = stack_put_body;
            body_buf_sz = HTTP_BODY_MAX;
        }

        memset(req_body, 0, (size_t)body_buf_sz);

        const char *body_start = hdr_end + hdr_end_len;
        const int already = (int)((rx + r) - body_start);
        int copied = 0;
        if (already > 0) {
            copied = already;
            if (copied > content_len) copied = content_len;
            memcpy(req_body, body_start, (size_t)copied);
        }

        /* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: улучшенное чтение тела запроса для больших конфигураций
         * 
         * Проблема: при конфигурации на 12+ дверей JSON может быть >3000 байт.
         * Чтение по 256 байт за раз с таймаутом 200ms может не успеть, особенно
         * при медленной сети или задержках, что приводит к ошибке "Bad Body".
         * 
         * Решение:
         * 1. Проверяем готовность сокета через select перед каждым recv
         * 2. Увеличиваем таймаут select для больших запросов
         * 3. Добавляем повторные попытки при временных ошибках
         * 4. Увеличиваем размер чанка для более эффективного чтения
         */
        int recv_attempts = 0;
        const int max_recv_attempts = 200; /* больше попыток для больших запросов */
        const uint32_t recv_start_ms = HAL_GetTick();
        const uint32_t recv_timeout_ms = 30000U; /* 30 секунд общий таймаут */
        
        while (copied < content_len) {
            /* Проверяем общий таймаут */
            if ((HAL_GetTick() - recv_start_ms) > recv_timeout_ms) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                AppLog("HTTP: body recv timeout (copied=%d/%d)", copied, content_len);
#endif
                break;
            }
            
            /* Проверяем готовность сокета к чтению через select */
            fd_set rfds;
            FD_ZERO(&rfds);
            FD_SET(cfd, &rfds);
            struct timeval tv_recv;
            tv_recv.tv_sec = 0;
            tv_recv.tv_usec = 500000; /* 500ms таймаут (увеличен для больших запросов) */
            int sel_recv = lwip_select(cfd + 1, &rfds, NULL, NULL, &tv_recv);
            
            if (sel_recv <= 0) {
                recv_attempts++;
                if (recv_attempts >= max_recv_attempts) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                    AppLog("HTTP: body recv max attempts reached (copied=%d/%d)", copied, content_len);
#endif
                    break;
                }
                /* Небольшая задержка перед повторной попыткой */
                osDelay(10);
                continue;
            }
            
            /* Сокет готов - читаем данные */
            recv_attempts = 0; /* Сбрасываем счетчик при успешной готовности */
            const int need = content_len - copied;
            const int chunk_max = is_put_cfg_full ? 2048 : 512;
            const int chunk = (need > chunk_max) ? chunk_max : need;
            int rr = (int)lwip_recv(cfd, req_body + copied, (size_t)chunk, 0);
            
            if (rr > 0) {
                copied += rr;
            } else if (rr == 0) {
                /* Соединение закрыто */
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                AppLog("HTTP: body recv connection closed (copied=%d/%d)", copied, content_len);
#endif
                break;
            } else {
                /* Ошибка чтения - проверяем errno */
                int err = errno;
                if (err == EAGAIN || err == EWOULDBLOCK) {
                    /* Временная ошибка - продолжаем попытки */
                    recv_attempts++;
                    if (recv_attempts < max_recv_attempts) {
                        osDelay(10);
                        continue;
                    }
                }
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
                AppLog("HTTP: body recv error errno=%d (copied=%d/%d)", err, copied, content_len);
#endif
                break;
            }
        }
        
        if (copied != content_len) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
            AppLog("HTTP: body incomplete (copied=%d/%d, attempts=%d)", copied, content_len, recv_attempts);
#endif
            http_send_simple(cfd, 400, "text/plain", "Bad Body\n");
            (void)lwip_close(cfd);
            return;
        }
        
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
        AppLog("HTTP: body received OK (%d bytes)", copied);
#endif

        req_body[content_len] = '\0';

        const int hdr_len = (int)(hdr_end - hdr_start);
        char resp[1024];
        const int api_code = HttpApi_HandlePut(path, req_body, (size_t)content_len, hdr_start, hdr_len, resp, sizeof(resp));
        if (api_code == 200) {
            http_send_simple(cfd, 200, "application/json", resp);
        } else if (api_code == 401) {
            http_send_simple(cfd, 401, "application/json", resp);
        } else if (api_code == 400) {
            http_send_simple(cfd, 400, "application/json", resp);
        } else if (api_code == 404) {
            http_send_simple(cfd, 404, "text/plain", "Not Found\n");
        } else {
            http_send_simple(cfd, 500, "application/json", resp);
        }

        (void)lwip_close(cfd);

        /* После критичных операций (apply config / clear flash) — автосброс,
         * чтобы изменения консистентно вступили в силу при загрузке. */
        if (api_code == 200 &&
            (strcmp(path, "/api/config") == 0 ||
             strcmp(path, "/api/config/full") == 0 ||
             strcmp(path, "/api/flash/clear") == 0) &&
            HttpApi_ConfigApplyRequestsReboot()) {
            HttpApi_ClearRebootRequest();
            osDelay(200);
            HAL_NVIC_SystemReset();
        }
        return;
    }

    if (strcmp(method, "POST") == 0) {
        /* POST запросы (аутентификация) */
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_REQUESTS
        AppLog("HTTP: POST %s", path);
#endif
        if (!hdr_start_orig) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
            AppLog("HTTP: POST Bad Headers - no header start found");
#endif
            http_send_simple(cfd, 400, "text/plain", "Bad Headers\n");
            (void)lwip_close(cfd);
            return;
        }
        
        const char *hdr_start = hdr_start_orig;
        const char *hdr_end = strstr(hdr_start, "\r\n\r\n");
        int hdr_end_len = 4;
        if (!hdr_end) {
            hdr_end = strstr(hdr_start, "\n\n");
            hdr_end_len = 2;
        }
        if (!hdr_end) {
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_ERRORS
            AppLog("HTTP: POST Bad Headers - cannot find header end");
#endif
            http_send_simple(cfd, 400, "text/plain", "Bad Headers\n");
            (void)lwip_close(cfd);
            return;
        }

        const int content_len = header_find_content_length(hdr_start);
        if (content_len < 0 || content_len > HTTP_BODY_MAX) {
            http_send_simple(cfd, 411, "text/plain", "Length Required\n");
            (void)lwip_close(cfd);
            return;
        }

        /* Читаем body (аналогично PUT) */
        char req_body[HTTP_BODY_MAX + 1];
        memset(req_body, 0, sizeof(req_body));
        
        const char *body_start = hdr_end + hdr_end_len;
        int body_in_rx = (int)(r - (body_start - rx));
        
        if (body_in_rx > 0) {
            int copy_len = (body_in_rx < content_len) ? body_in_rx : content_len;
            memcpy(req_body, body_start, copy_len);
            if (copy_len < content_len) {
                /* Дочитываем остаток body */
                int copied = copy_len;
                int recv_attempts = 0;
                const int max_recv_attempts = 200;
                
                while (copied < content_len && recv_attempts < max_recv_attempts) {
                    fd_set rfds_post;
                    FD_ZERO(&rfds_post);
                    FD_SET(cfd, &rfds_post);
                    struct timeval tv_post;
                    tv_post.tv_sec = 0;
                    tv_post.tv_usec = 500000; /* 500ms */
                    int sel_post = lwip_select(cfd + 1, &rfds_post, NULL, NULL, &tv_post);
                    if (sel_post <= 0) break;
                    
                    int rr = (int)lwip_recv(cfd, req_body + copied, content_len - copied, 0);
                    if (rr > 0) {
                        copied += rr;
                    } else if (rr == 0) {
                        break;
                    } else {
                        int err = errno;
                        if (err == EAGAIN || err == EWOULDBLOCK) {
                            recv_attempts++;
                            osDelay(10);
                            continue;
                        }
                        break;
                    }
                }
            }
        } else {
            /* Body полностью в отдельном запросе */
            int copied = 0;
            int recv_attempts = 0;
            const int max_recv_attempts = 200;
            
            while (copied < content_len && recv_attempts < max_recv_attempts) {
                fd_set rfds_post;
                FD_ZERO(&rfds_post);
                FD_SET(cfd, &rfds_post);
                struct timeval tv_post;
                tv_post.tv_sec = 0;
                tv_post.tv_usec = 500000; /* 500ms */
                int sel_post = lwip_select(cfd + 1, &rfds_post, NULL, NULL, &tv_post);
                if (sel_post <= 0) break;
                
                int rr = (int)lwip_recv(cfd, req_body + copied, content_len - copied, 0);
                if (rr > 0) {
                    copied += rr;
                } else if (rr == 0) {
                    break;
                } else {
                    int err = errno;
                    if (err == EAGAIN || err == EWOULDBLOCK) {
                        recv_attempts++;
                        osDelay(10);
                        continue;
                    }
                    break;
                }
            }
        }
        
        req_body[content_len] = 0; /* null-terminate */
        
        const int hdr_len_post = (int)(hdr_end - hdr_start);
        char resp[512];
        const int api_code = HttpApi_HandlePost(path, req_body, (size_t)content_len, hdr_start, hdr_len_post, resp, sizeof(resp));
#if HTTP_DEBUG_ENABLED && HTTP_DEBUG_RESPONSES
        AppLog("HTTP: POST response code=%d path=%s", api_code, path);
#endif
        if (api_code == 200) {
            http_send_simple(cfd, 200, "application/json", resp);
        } else if (api_code == 401) {
            http_send_simple(cfd, 401, "application/json", resp);
        } else if (api_code == 429) {
            http_send_simple(cfd, 429, "application/json", resp);
        } else if (api_code == 404) {
            http_send_simple(cfd, 404, "application/json", resp);
        } else {
            http_send_simple(cfd, api_code, "application/json", resp);
        }
        (void)lwip_close(cfd);

        /* После полной очистки flash — автосброс для консистентного re-init всех сервисов. */
        if (api_code == 200 &&
            strcmp(path, "/api/flash/clear") == 0 &&
            HttpApi_ConfigApplyRequestsReboot()) {
            HttpApi_ClearRebootRequest();
            osDelay(200);
            HAL_NVIC_SystemReset();
        }
        return;
    }

    http_send_simple(cfd, 405, "text/plain", "Method Not Allowed\n");

    (void)lwip_close(cfd);
}
