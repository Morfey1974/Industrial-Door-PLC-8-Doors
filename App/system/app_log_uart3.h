#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Командный интерфейс через UART3 (Этап 7: журнал).
 *
 * Ожидаемые команды:
 *   log dump [N]
 *   log stat
 *   log clear
 */
void AppLog_Uart3_HandleCommand(const char *cmd);

#ifdef __cplusplus
}
#endif
