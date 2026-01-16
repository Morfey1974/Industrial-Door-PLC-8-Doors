#pragma once

#include <stdint.h>
#include <stddef.h>

#include "FreeRTOS.h"
#include "queue.h"

#include "config/config_layout.h" /* QSPI_EVENT_LOG_* */
#include "system/app_events.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    JOURNAL_OK = 0,
    JOURNAL_QUEUE_FULL = 1,
    JOURNAL_NOT_INIT = 2,
    JOURNAL_IO_ERROR = 3,
} journal_status_t;

#ifndef JOURNAL_QUEUE_LEN
#define JOURNAL_QUEUE_LEN 64
#endif

/* Инициализация подсистемы. Должна вызываться на старте (до запуска JournalTask).
 * Не выполняет длительных операций.
 */
void EventJournal_Init(void);

/* Вызывается из AppEvents_Publish (не блокирует). */
journal_status_t EventJournal_EnqueueEvent(const app_event_t *evt);

/* Логирование операций конфигурации (для 7.4, 7.5.8):
 * user_id может быть 0, если WEB ещё не реализован.
 */
void EventJournal_LogConfigAction(uint32_t action_id, uint32_t cfg_seq, uint32_t user_id, uint32_t result);

/* Сервис: стереть область журнала (полный reset журнала). */
journal_status_t EventJournal_EraseAll(void);

/* Сервис: получить статистику. */
typedef struct {
    uint32_t base;
    uint32_t size;
    uint32_t sector_size;
    uint32_t sectors;
    uint32_t current_sector;
    uint32_t current_seq;
    uint32_t records_written;
    uint32_t dropped_queue;
    uint32_t io_errors;
} journal_stats_t;

void EventJournal_GetStats(journal_stats_t *out);

/* --- Сервисные функции для тестирования (Этап 7.4/7.5) ---
 * Важно: эти функции предполагают, что QSPI уже инициализирован и журнал смонтирован.
 * Печать идёт через AppLog (UART3 через LoggerTask).
 */

/* Распечатать последние N валидных записей (N=1..). */
void EventJournal_DumpLast(uint32_t count);

/* Коротко распечатать статистику журнала (текущий сектор/seq, счётчики). */
void EventJournal_PrintStats(void);

/* Очистить (стереть) журнал. Эквивалент EventJournal_EraseAll(), но удобнее для CLI. */
journal_status_t EventJournal_Clear(void);

/* --- Internal for JournalTask --- */
BaseType_t EventJournal_WaitEvent(app_event_t *out_evt, TickType_t ticks_to_wait);
void EventJournal_WriteEventToFlash(const app_event_t *evt);

#ifdef __cplusplus
}
#endif
