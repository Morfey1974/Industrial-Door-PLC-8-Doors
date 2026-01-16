#include "app_log.h"

#include <string.h>

#include "usart.h" /* extern UART_HandleTypeDef huart3; */


/* --- Этап 7: команды для проверки журнала ---
 * В проекте ввод команд может быть реализован в comms_task / консоли.
 * Чтобы не ломать архитектуру, здесь мы только предоставляем функцию-обработчик,
 * которую можно вызвать при получении полной строки команды.
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
}

/* Обработчик команд (ASCII), предназначен для ручного тестирования этапа 7.
 * Подключение: вызови эту функцию из места, где ты принимаешь строку команды из UART3.
 *
 * Поддерживаемые команды:
 *   log dump   - вывести последние 20 записей
 *   log stat   - статистика журнала
 *   log clear  - стереть журнал
 */
void AppLog_Uart3_HandleCommand(const char *cmd)
{
    if (cmd == NULL) return;

    /* Нормализуем пробелы/окончания строк: сравниваем по префиксу. */
    if (strncmp(cmd, "log dump", 8) == 0)
    {
        EventJournal_DumpLast(20);
        return;
    }
    if (strncmp(cmd, "log stat", 8) == 0)
    {
        EventJournal_PrintStats();
        return;
    }
    if (strncmp(cmd, "log clear", 9) == 0)
    {
        (void)EventJournal_Clear();
        AppLog("JOURNAL: cleared");
        return;
    }
}
