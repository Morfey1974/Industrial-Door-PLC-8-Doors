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

/* Логирование действий пользователя из UI: имя пользователя и время с ПК (Unix сек).
 * action_id: 2=CONFIG_SAVE, 3=USER_LOGIN, 4=USER_LOGOUT. result — код результата (1=успех и т.д.).
 * Запись пишется с timestamp = client_unix_sec (время ПК), чтобы при сбое RTC было видно, когда пользователь действовал.
 */
void EventJournal_LogUserAction(uint32_t action_id, const char *username, uint32_t client_unix_sec, uint32_t result);

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
    /* Количество валидных записей, реально доступных в кольцевом буфере сейчас.
     * Используется WebUI для корректной пагинации (/api/journal/stat). */
    uint32_t total_records;
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

/* Дополнительные диагностические функции */
void EventJournal_PrintDetailedInfo(void);
void EventJournal_PrintRecordInfo(void);

/* --- HTTP API: чтение записей с пагинацией (Этап 9) ---
 * Читает записи журнала в обратном хронологическом порядке (новые -> старые).
 * 
 * Параметры:
 *   offset - количество записей для пропуска (0 = начать с самых новых)
 *   limit - максимальное количество записей для чтения (1..200)
 *   out_records - буфер для записи структур записей (должен быть размером >= limit)
 *   out_count - выходной параметр: фактическое количество прочитанных записей
 * 
 * Возвращает:
 *   JOURNAL_OK - успешно
 *   JOURNAL_NOT_INIT - журнал не инициализирован
 *   JOURNAL_IO_ERROR - ошибка чтения из QSPI
 * 
 * Примечание: функция блокирует доступ к QSPI через AppQspiLock.
 */
#define JOURNAL_RECORD_USERNAME_MAX 17  /* 16 символов + '\0' для выдачи в API */

typedef struct {
    uint32_t recSeq;
    uint32_t timestamp;
    uint16_t type;
    uint16_t source;
    uint8_t  door_id;
    uint8_t  flags;
    uint32_t arg;
    char     username[JOURNAL_RECORD_USERNAME_MAX];  /* для событий из UI (логин, логаут, сохранение конфига) */
} journal_record_t;

journal_status_t EventJournal_ReadRecords(uint32_t offset, uint32_t limit,
                                          journal_record_t *out_records,
                                          uint32_t *out_count);

/* RAM-очередь журнала → flash (GET /api/buffers). Без полного обхода QSPI. */
void EventJournal_GetRamQueueMetrics(uint32_t *out_waiting, uint32_t *out_capacity,
                                     uint32_t *out_peak_waiting);
void EventJournal_GetQuickCounters(uint32_t *out_dropped_queue, uint32_t *out_io_errors);

/* --- Internal for JournalTask --- */
BaseType_t EventJournal_WaitEvent(app_event_t *out_evt, TickType_t ticks_to_wait);
void EventJournal_WriteEventToFlash(const app_event_t *evt);

#ifdef __cplusplus
}
#endif
