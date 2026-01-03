#ifndef MODBUS_H
#define MODBUS_H

#ifdef __cplusplus
extern "C" {
#endif

#include "main.h"
#include "usart.h"   // huart4, huart3

typedef enum
{
    MB_MODE_MASTER = 0,
    MB_MODE_SLAVE  = 1,
} MB_Mode_t;

/**
 * @brief Инициализация тестового режима RS-485.
 * @param mode  MB_MODE_MASTER - эта плата шлёт "HELLO"
 *              MB_MODE_SLAVE  - эта плата принимает и ретранслирует в UART3
 */
void MB_RS485_Test_Init(MB_Mode_t mode);

/**
 * @brief Один шаг теста RS-485.
 *
 * Вызывается периодически из задачи FreeRTOS.
 * Для master раз в секунду отправит "HELLO\r\n".
 * Для slave непрерывно читает все принятые байты и шлёт их в UART3.
 */
void MB_RS485_Test_Task(void);

#ifdef __cplusplus
}
#endif

#endif /* MODBUS_H */
