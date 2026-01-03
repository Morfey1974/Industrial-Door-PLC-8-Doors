#include "modbus.h"
#include "string.h"
#include "cmsis_os.h"  // Для osDelay()
#include <stdio.h>      // Для snprintf

static inline void RS485_SetTx(void)
{
    HAL_GPIO_WritePin(RS485_DE_GPIO_Port, RS485_DE_Pin, GPIO_PIN_SET);   // DE = 1 → передача
}

static inline void RS485_SetRx(void)
{
    HAL_GPIO_WritePin(RS485_DE_GPIO_Port, RS485_DE_Pin, GPIO_PIN_RESET); // DE = 0 → приём
}


static MB_Mode_t s_mode = MB_MODE_MASTER;

void MB_RS485_Test_Init(MB_Mode_t mode)
{
    s_mode = mode;
    RS485_SetRx();   // по умолчанию в приёме
}

/**
 * MASTER:
 *   - раз в 1000 мс отправляет "HELLO\r\n" по UART4 (через RS-485).
 *
 * SLAVE:
 *   - собирает строку до '\n' с UART4
 *   - когда строка готова, выводит её целиком в UART3 как "[RS485] HELLO".
 */
void MB_RS485_Test_Task(void)
{
    if (s_mode == MB_MODE_MASTER)
    {
        static uint32_t lastTick = 0;
        uint32_t now = HAL_GetTick();

        if ((now - lastTick) >= 1000U)
        {
            lastTick = now;

            static const uint8_t msg[] = "HELLO\r\n";

            // 1. TX + задержка
            RS485_SetTx();
            osDelay(5);  // Увеличено до 5 мс

            // 2. Отправка
            HAL_UART_Transmit(&huart4, (uint8_t*)msg, 7, 100);

            // 3. Ждем ОБЯЗАТЕЛЬНО 10 мс перед переключением!
            osDelay(10);  // Ключевое изменение!

            // 4. Переключаемся в RX
            RS485_SetRx();

            Debug_Print("M> HELLO\r\n");
        }
    }
    else  // SLAVE
    {
        uint8_t buffer[32];
        uint8_t byte;
        uint16_t idx = 0;
        uint32_t timeout = HAL_GetTick();

        // Сбрасываем буфер если прошло больше 50 мс
        static uint32_t last_receive = 0;
        static uint8_t save_buffer[32];
        static uint8_t save_idx = 0;

        // Читаем пока есть данные, но не дольше 20 мс
        while ((HAL_GetTick() - timeout) < 20 && idx < 31)
        {
            if (HAL_UART_Receive(&huart4, &byte, 1, 0) == HAL_OK)
            {
                buffer[idx++] = byte;
                timeout = HAL_GetTick();  // Сброс таймаута

                // Эхо на отладку
                //HAL_UART_Transmit(&huart3, &byte, 1, 10);
            }
        }

        // Если что-то приняли
        if (idx > 0)
        {
            buffer[idx] = '\0';

            // Проверяем целостность
            if (idx == 7 && buffer[0] == 'H' && buffer[5] == '\r' && buffer[6] == '\n')
            {
                Debug_Print("S< FULL: ");
                Debug_Print((char*)buffer);
            }
            else
            {
                Debug_Print("S< PART(");
                // Простой вывод длины
                if (idx < 10) {
                    char len[2] = {idx + '0', '\0'};
                    Debug_Print(len);
                }
                Debug_Print("): ");
                Debug_Print((char*)buffer);
            }
            Debug_Print("\r\n");
        }
    }
}
