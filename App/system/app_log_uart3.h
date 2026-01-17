#pragma once
#include <stddef.h>
#include <stdint.h>
#include "FreeRTOS.h"

#ifdef __cplusplus
extern "C" {
#endif

void AppLog_Uart3_OnRxBytes(const uint8_t *data, size_t len, BaseType_t in_isr);
void AppLog_Uart3_ResetParserFromISR(void);
void AppLog_Uart3_OnRxIdle(BaseType_t in_isr);


/* ВАРИАНТ B:
 * Вызов из задачи для выполнения pending команд (НЕ из IRQ!)
 */
void AppLog_Uart3_ProcessPending(void);

#ifdef __cplusplus
}
#endif
