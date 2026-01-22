#include "app_log.h"

#include <string.h>
#include <stdint.h>
#include <stdbool.h>

#include "FreeRTOS.h"
#include "task.h"
#include "portable.h" /* xPortGetFreeHeapSize, xPortGetMinimumEverFreeHeapSize */
#include "cmsis_os.h" /* osThreadId_t */

#include "usart.h" /* extern UART_HandleTypeDef huart3; */

/* --- Этап 7.4: UART3 CLI для проверки журнала событий ---
 *
 * Проблема, которая часто всплывает на STM32+HAL:
 * - «эхо» в терминале видно
 * - но обработчик команд то не срабатывает, то ломается от ESC-последовательностей,
 *   то зависает, если выполнять тяжёлые вещи внутри IRQ.
 *
 * Решение здесь:
 *  1) usart.c принимает байты через HAL_UARTEx_ReceiveToIdle_IT
 *  2) usart.c вызывает AppLog_Uart3_OnRxBytes(..., in_isr=pdTRUE)
 *  3) Здесь мы:
 *     - собираем строку до CR/LF
 *     - чистим управляющие/ESC
 *     - выполнение команды делаем НЕ в IRQ
 *
 * ВАЖНО (ВАРИАНТ B):
 * ------------------
 * FreeRTOS Timers у тебя выключены, поэтому xTimerPendFunctionCallFromISR() недоступна.
 * Значит "defer" делаем так:
 *   - в IRQ только складываем готовые строки команд в pending-очередь
 *   - выполнение команд делаем из контекста задачи вызовом:
 *         AppLog_Uart3_ProcessPending();
 *
 * Это максимально надёжно и не требует включать Software Timers.
 */

#include "log/event_journal.h"

/*
 * Вывод строк логгера AppLog на UART3.
 *
 * Этот файл переопределяет weak-функцию AppLog_Output() из logger_task.c.
 *
 * Условие: MX_USART3_UART_Init() должен быть вызван до запуска FreeRTOS.
 * Писать сюда из разных задач не нужно: вывод идёт только из LoggerTask.
 */
void AppLog_Output(const char *line)
{
    if (line == NULL)
        return;

    /* Защитимся от отсутствия инициализации (на ранних стадиях старта). */
    if (huart3.gState == HAL_UART_STATE_RESET)
        return;

    /* Передаём строку как есть (can_task уже добавляет \r\n). */
    const size_t len = strnlen(line, APP_LOG_MSG_MAX);
    if (len == 0U)
        return;

    /* Короткий timeout, чтобы не подвесить LoggerTask. */
    (void)HAL_UART_Transmit(&huart3, (uint8_t *)line, (uint16_t)len, 20U);
    /* Сделаем вывод читаемым в любом терминале: если строка не заканчивается
         * переводом строки (\r/\n), добавим \r\n.
         *
         * Так мы решаем проблему "слипания" сообщений:
         *   ...log statJOURNAL: ...log dump...
         */
        if (len > 0U)
        {
            const char last = line[len - 1U];
            if ((last != '\n') && (last != '\r'))
            {
                static const uint8_t crlf[2] = { '\r', '\n' };
                (void)HAL_UART_Transmit(&huart3, (uint8_t *)crlf, 2U, 20U);
            }
        }
}


/* ---------------- UART3 CLI: приём и разбор строки ---------------- */

#ifndef UART3_CLI_LINE_MAX
#define UART3_CLI_LINE_MAX 128u
#endif

/* Пул готовых строк, чтобы не malloc-ить в IRQ */
#define UART3_CLI_CMD_POOL 4u

static char     s_cli_line[UART3_CLI_LINE_MAX];
static uint32_t s_cli_line_len = 0u;

static char     s_cmd_pool[UART3_CLI_CMD_POOL][UART3_CLI_LINE_MAX];
static uint32_t s_cmd_pool_wr = 0u;

/* Состояние фильтрации ESC-последовательностей (стрелки и т.п.) */
static bool s_esc_active = false;
static bool s_esc_csi = false; /* ESC [ ... */

/* ---------------- ВАРИАНТ B: pending-очередь команд ----------------
 * Почему это нужно:
 *  - мы не можем выполнять команды в IRQ
 *  - и не можем xTimerPendFunctionCallFromISR (timers выключены)
 *
 * Поэтому:
 *  - ISR кладёт "номер слота" (0..UART3_CLI_CMD_POOL-1) в pending очередь
 *  - задача периодически вызывает AppLog_Uart3_ProcessPending() и выполняет команды
 *
 * Очередь сделана примитивно и безопасно для ISR<->Task:
 *  - tail пишет ISR, head пишет Task
 *  - 32-битные операции на Cortex-M атомарны
 */
#define UART3_CLI_PENDING_Q 8u
static volatile uint8_t  s_pending_q[UART3_CLI_PENDING_Q];
static volatile uint32_t s_pending_head = 0u; /* читает/меняет Task */
static volatile uint32_t s_pending_tail = 0u; /* пишет ISR */

static void prv_cli_submit_line_from_isr(const char *line);
static void prv_cli_execute(char *cmd);
static void prv_cli_trim_inplace(char *s);
static void prv_cli_print_help(void);
static void prv_cli_print_mem_stat(void);

static void prv_pending_push_from_isr(uint8_t slot);

void AppLog_Uart3_ResetParserFromISR(void)
{
    /* Вызывается из UART error callback (IRQ). */
    s_cli_line_len = 0u;
    s_esc_active = false;
    s_esc_csi = false;
}

/* ВАРИАНТ B:
 * Эту функцию нужно вызывать из контекста задачи (НЕ из IRQ).
 * Лучшее место — LoggerTask (потому что вывод в UART3 идёт через AppLog).
 *
 * Частота вызова:
 *  - можно каждый цикл
 *  - или раз в 10-50 мс (как тебе удобнее)
 */
void AppLog_Uart3_ProcessPending(void)
{
    for (;;)
    {
        uint32_t head = s_pending_head;
        uint32_t tail = s_pending_tail;

        if (head == tail)
        {
            /* очередь пустая */
            break;
        }

        /* Забираем слот и продвигаем head */
        uint8_t slot = s_pending_q[head % UART3_CLI_PENDING_Q];
        s_pending_head = head + 1u;

        if (slot < UART3_CLI_CMD_POOL)
        {
            prv_cli_execute(s_cmd_pool[slot]);
        }
    }
}

/* Приём байт от UART3.
 * in_isr:
 *  - pdTRUE: вызов из IRQ (HAL_UARTEx_RxEventCallback)
 *  - pdFALSE: можно использовать и из задачи (на будущее)
 */
void AppLog_Uart3_OnRxBytes(const uint8_t *data, size_t len, BaseType_t in_isr)
{
    (void)in_isr;
    if ((data == NULL) || (len == 0u))
        return;

    for (size_t i = 0; i < len; i++)
    {
        const uint8_t b = data[i];

        /* NUL игнорируем */
        if (b == 0u)
            continue;

        /* ESC-последовательности терминалов (стрелки, Home/End и т.п.)
         * Обычно: ESC [ ... <буква>
         */
        if (b == 0x1Bu) /* ESC */
        {
            s_esc_active = true;
            s_esc_csi = false;
            continue;
        }
        if (s_esc_active)
        {
            if (!s_esc_csi)
            {
                /* Первый байт после ESC */
                if (b == (uint8_t)'[')
                {
                    s_esc_csi = true;
                    continue;
                }
                /* Непонятная ESC-команда — просто гасим */
                s_esc_active = false;
                s_esc_csi = false;
                continue;
            }
            /* CSI: ESC [ 0..9 ; ... <финальный символ> */
            if ((b >= (uint8_t)'0' && b <= (uint8_t)'9') || b == (uint8_t)';')
            {
                continue;
            }
            /* Финальный символ CSI обычно буква (A/B/C/D) или ~ */
            s_esc_active = false;
            s_esc_csi = false;
            continue;
        }

        /* Backspace / DEL */
        if (b == 0x08u || b == 0x7Fu)
        {
            if (s_cli_line_len > 0u)
                s_cli_line_len--;
            continue;
        }

        /* Конец строки */
        if (b == (uint8_t)'\r' || b == (uint8_t)'\n')
        {
            if (s_cli_line_len > 0u)
            {
                s_cli_line[s_cli_line_len] = '\0';
                prv_cli_submit_line_from_isr(s_cli_line);
                s_cli_line_len = 0u;
            }
            continue;
        }

        /* Оставляем только печатный ASCII (space..~) */
        if (b < 0x20u || b > 0x7Eu)
            continue;

        if (s_cli_line_len < (UART3_CLI_LINE_MAX - 1u))
        {
            s_cli_line[s_cli_line_len++] = (char)b;
        }
        else
        {
            /* Переполнение строки — сбросим, чтобы не выполнять мусор */
            s_cli_line_len = 0u;
        }
    }
}

static void prv_cli_submit_line_from_isr(const char *line)
{
    if (line == NULL)
        return;

    /* Копируем в пул (слот для команды) */
    const uint32_t slot32 = (s_cmd_pool_wr % UART3_CLI_CMD_POOL);
    const uint8_t  slot   = (uint8_t)slot32;
    s_cmd_pool_wr++;

    /* Копируем с гарантированным NUL */
    (void)strncpy(s_cmd_pool[slot], line, UART3_CLI_LINE_MAX - 1u);
    s_cmd_pool[slot][UART3_CLI_LINE_MAX - 1u] = '\0';

    /* ВАРИАНТ B: просто кладём слот в pending очередь.
     * Выполнение произойдёт позже из задачи через AppLog_Uart3_ProcessPending().
     */
    prv_pending_push_from_isr(slot);
}

static void prv_pending_push_from_isr(uint8_t slot)
{
    /* tail продвигает ISR, head продвигает Task */
    uint32_t head = s_pending_head;
    uint32_t tail = s_pending_tail;

    /* Проверка переполнения:
     * если (tail - head) >= размер очереди => места нет
     */
    if ((tail - head) >= UART3_CLI_PENDING_Q)
    {
        /* Очередь переполнена — дропаем команду.
         * Это безопаснее, чем зависать/портить память.
         */
        return;
    }

    s_pending_q[tail % UART3_CLI_PENDING_Q] = slot;
    s_pending_tail = tail + 1u;
}

/* Выполнение команды — НЕ в IRQ, а в контексте задачи (через ProcessPending) */
static void prv_cli_execute(char *cmd)
{
    if (cmd == NULL)
        return;

    prv_cli_trim_inplace(cmd);
    if (cmd[0] == '\0')
        return;

    /* Поддерживаемые команды:
     *   log help
     *   log stat
     *   log dump [N]
     *   log clear
     *   mem stat
     */
    if (strncmp(cmd, "mem", 3) == 0)
    {
        /* Команда mem stat - статистика памяти */
        char *p = cmd + 3;
        while (*p == ' ') p++;
        if (strncmp(p, "stat", 4) == 0)
        {
            prv_cli_print_mem_stat();
            return;
        }
        AppLog("CLI: unknown mem subcmd (try: mem stat)");
        return;
    }
    
    if (strncmp(cmd, "log", 3) != 0)
    {
        AppLog("CLI: unknown cmd (try: log help or mem stat)");
        return;
    }

    /* Пропустим 'log' и пробелы */
    char *p = cmd + 3;
    while (*p == ' ') p++;

    if ((*p == '\0') || (strncmp(p, "help", 4) == 0))
    {
        prv_cli_print_help();
        return;
    }
    if (strncmp(p, "stat", 4) == 0)
    {
        EventJournal_PrintStats();
        return;
    }
    if (strncmp(p, "clear", 5) == 0)
    {
    	/* Косметика для UX:
    	     * очистка может занять время (QSPI erase),
    	     * поэтому сначала явно сообщаем, что процесс начался.
    	     */
    	    AppLog("JOURNAL: clearing...");
        const journal_status_t st = EventJournal_Clear();
        if (st == JOURNAL_OK)
            AppLog("JOURNAL: cleared");
        else
            AppLog("JOURNAL: clear failed (%lu)", (unsigned long)st);
        return;
    }
    if (strncmp(p, "dump", 4) == 0)
    {
        uint32_t n = 20u;
        p += 4;
        while (*p == ' ') p++;
        if (*p != '\0')
        {
            /* Парсим N (без atoi, чтобы не тащить лишнее) */
            uint32_t acc = 0u;
            while (*p >= '0' && *p <= '9')
            {
                acc = (acc * 10u) + (uint32_t)(*p - '0');
                p++;
            }
            if (acc > 0u)
                n = acc;
        }
        EventJournal_DumpLast(n);
        return;
    }

    AppLog("CLI: unknown log subcmd (try: log help)");
}

static void prv_cli_print_help(void)
{
    AppLog("CLI commands:");
    AppLog("  log help            - this help");
    AppLog("  log stat            - journal statistics");
    AppLog("  log dump [N]         - dump last N records (default 20)");
    AppLog("  log clear           - erase journal");
    AppLog("  mem stat            - memory usage statistics");
}

static void prv_cli_print_mem_stat(void)
{
    /* FreeRTOS heap statistics */
    size_t free_heap = xPortGetFreeHeapSize();
    size_t min_ever_free = xPortGetMinimumEverFreeHeapSize();
    size_t total_heap = 65536; /* configTOTAL_HEAP_SIZE */
    size_t used_heap = total_heap - free_heap;
    size_t max_used_heap = total_heap - min_ever_free;
    
    AppLog("=== Memory Statistics ===");
    AppLog("Heap (FreeRTOS):");
    AppLog("  Total:     %lu bytes", (unsigned long)total_heap);
    AppLog("  Free:      %lu bytes", (unsigned long)free_heap);
    /* Вычисляем проценты как целые числа, т.к. newlib nano может не поддерживать float в printf */
    unsigned long used_pct = (used_heap * 100UL) / total_heap;
    unsigned long max_used_pct = (max_used_heap * 100UL) / total_heap;
    AppLog("  Used:      %lu bytes (%lu%%)", 
           (unsigned long)used_heap, used_pct);
    AppLog("  Min free:  %lu bytes (max used: %lu, %lu%%)",
           (unsigned long)min_ever_free,
           (unsigned long)max_used_heap,
           max_used_pct);
    
    /* Stack usage for all tasks */
    AppLog("Task Stacks:");
    
    /* Получаем handles задач из freertos.c */
    extern osThreadId_t netTaskHandle;
    extern osThreadId_t commsTaskHandle;
    extern osThreadId_t doorsTaskHandle;
    extern osThreadId_t supervisorTaskHandle;
    extern osThreadId_t httpTaskHandle;
    extern osThreadId_t canTaskHandle;
    extern osThreadId_t rs485TaskHandle;
    extern osThreadId_t loggerTaskHandle;
    extern osThreadId_t watchdogTaskHandle;
    extern osThreadId_t journalTaskHandle;
    
    struct {
        const char *name;
        osThreadId_t handle;
        uint32_t stack_size;
    } tasks[] = {
        {"netTask", netTaskHandle, 768 * 4},
        {"commsTask", commsTaskHandle, 512 * 4},
        {"doorsTask", doorsTaskHandle, 512 * 4},
        {"supervisorTask", supervisorTaskHandle, 512 * 4},
        {"httpTask", httpTaskHandle, 3072 * 4},  /* Обновлено: было 2048*4, стало 3072*4 (12288 байт) */
        {"canTask", canTaskHandle, 512 * 4},
        {"rs485Task", rs485TaskHandle, 512 * 4},
        {"loggerTask", loggerTaskHandle, 512 * 4},
        {"watchdogTask", watchdogTaskHandle, 512 * 4},
        {"journalTask", journalTaskHandle, 512 * 4},
    };
    
    for (size_t i = 0; i < sizeof(tasks)/sizeof(tasks[0]); i++)
    {
        if (tasks[i].handle != 0)
        {
            TaskHandle_t task_handle = (TaskHandle_t)tasks[i].handle;
            UBaseType_t high_water = uxTaskGetStackHighWaterMark(task_handle);
            /* high_water возвращает количество слов (4 байта на Cortex-M) */
            uint32_t free_stack = (uint32_t)high_water * 4;
            uint32_t used_stack = tasks[i].stack_size - free_stack;
            /* Вычисляем проценты как целые числа, т.к. newlib nano может не поддерживать float в printf */
            unsigned long usage_pct = (used_stack * 100UL) / tasks[i].stack_size;
            
            AppLog("  %-15s: %5lu/%5lu bytes used (%lu%%)",
                   tasks[i].name,
                   (unsigned long)used_stack,
                   (unsigned long)tasks[i].stack_size,
                   usage_pct);
        }
    }
    
    /* ВАЖНО: Сбрасываем состояние ESC-обработчика после вывода команды,
     * чтобы терминал не "завис" в каком-то режиме.
     * Это может происходить, если в выводе случайно есть последовательности,
     * которые терминал интерпретирует как ESC-команды.
     */
    s_esc_active = false;
    s_esc_csi = false;
    
    /* Добавляем пустую строку для читаемости и сброса состояния терминала */
    AppLog("");
}

/* Упрощённый trim: без динамики и без libc-изысков
 * - убираем пробелы слева/справа
 */
static void prv_cli_trim_inplace(char *str)
{
    if (str == NULL) return;

    /* Left trim */
    char *s = str;
    while (*s == ' ') s++;
    if (s != str)
    {
        size_t n = strlen(s);
        memmove(str, s, n + 1u);
    }

    /* Right trim */
    size_t len = strlen(str);
    while (len > 0u && str[len - 1u] == ' ')
    {
        str[len - 1u] = '\0';
        len--;
    }
}
/* Вызывается из USART3 RxEventCallback() после получения блока данных.
 * Используется как "конец команды" по паузе (idle), если терминал не шлёт CR/LF.
 */
void AppLog_Uart3_OnRxIdle(BaseType_t in_isr)
{
    (void)in_isr;

    if (s_cli_line_len == 0u)
        return;

    s_cli_line[s_cli_line_len] = '\0';
    prv_cli_submit_line_from_isr(s_cli_line);
    s_cli_line_len = 0u;
}

