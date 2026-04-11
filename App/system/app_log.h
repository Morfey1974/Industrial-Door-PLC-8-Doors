#pragma once

#include <stdint.h>
#include <stdarg.h>     /* va_list */
#include "FreeRTOS.h"
#include "queue.h"

/*
 * Простая очередь лог-сообщений для LoggerTask.
 *
 * На этапе 2/3 это минимальный каркас: текстовый буфер фикс. размера.
 */

#ifndef APP_LOG_MSG_MAX
#define APP_LOG_MSG_MAX 96
#endif

typedef struct
{
    uint32_t timestamp; /* xTaskGetTickCount() */
    char     text[APP_LOG_MSG_MAX];
} app_log_msg_t;

/* --------------------------------------------------------------------------
 * Инициализация и низкоуровневая работа с очередью логгера
 * -------------------------------------------------------------------------- */

void AppLog_Init(void);
BaseType_t AppLog_Push(const app_log_msg_t *msg, TickType_t ticks_to_wait);
BaseType_t AppLog_Pop(app_log_msg_t *msg, TickType_t ticks_to_wait);

void AppLog_GetQueueMetrics(uint32_t *out_waiting, uint32_t *out_capacity,
                            uint32_t *out_peak_waiting);

/* --------------------------------------------------------------------------
 * Высокоуровневый интерфейс логгера (printf-style)
 *
 * Используется прикладными модулями (doors, logic, journal, config).
 * Формирует строку и кладёт её в очередь LoggerTask.
 * -------------------------------------------------------------------------- */

/* printf-подобный лог */
void AppLog(const char *fmt, ...);

/* Вариант с va_list — удобен для обёрток и проксирования логов */
void AppLogV(const char *fmt, va_list ap);
