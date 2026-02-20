/**
  ******************************************************************************
  * @file    rtc_test_task.c
  * @brief   Задача теста RTC DS3231: периодический вывод времени/даты в UART3.
  *          Цикл с vTaskDelay (тик FreeRTOS из TIM6).
  ******************************************************************************
  */

#include "FreeRTOS.h"
#include "task.h"
#include "drivers/ds3231.h"
#include "usart.h"
#include <stdio.h>
#include <string.h>

#define RTC_TEST_PERIOD_MS  2000u   /* период вывода, мс */
#define RTC_LINE_MAX        80u

/* Маркеры на пути выполнения (не убирать до решения проблемы) */
#define RTC_MARK(id) do { \
  static const char _m[] = "RTC: " id "\r\n"; \
  (void)HAL_UART_Transmit(&huart3, (const uint8_t *)_m, (uint16_t)(sizeof(_m)-1), 50); \
} while(0)

void StartRtcTestTask(void *argument)
{
  (void)argument;
  ds3231_datetime_t dt;
  char buf[RTC_LINE_MAX];
  uint32_t count = 0u;

  RTC_MARK("start");  /* первая строка — задача вообще запустилась? */

  /* Первый вывод сразу при старте */
  if (DS3231_ReadDateTime(&dt))
  {
    int n = snprintf(buf, sizeof(buf), "RTC: [0] 20%02u-%02u-%02u %02u:%02u:%02u\r\n",
                     (unsigned)dt.year, (unsigned)dt.month, (unsigned)dt.date,
                     (unsigned)dt.hour, (unsigned)dt.min, (unsigned)dt.sec);
    if (n > 0 && (size_t)n < sizeof(buf))
      (void)HAL_UART_Transmit(&huart3, (uint8_t *)buf, (uint16_t)(size_t)n, 200);
  }
  else
  {
    static const char fail[] = "RTC: [0] read fail\r\n";
    (void)HAL_UART_Transmit(&huart3, (const uint8_t *)fail, (uint16_t)(sizeof(fail) - 1), 200);
  }
  count = 1u;

  RTC_MARK("L0");   /* после [0], перед циклом */

  /* Периодика в цикле задачи (тик идёт из TIM6 в main.c) */
  for (;;)
  {
    RTC_MARK("L1");   /* перед vTaskDelay */
    vTaskDelay(pdMS_TO_TICKS(RTC_TEST_PERIOD_MS));
    RTC_MARK("L2");   /* после vTaskDelay, перед чтением RTC */

    if (DS3231_ReadDateTime(&dt))
    {
      int n = snprintf(buf, sizeof(buf), "RTC: [%lu] 20%02u-%02u-%02u %02u:%02u:%02u\r\n",
                       (unsigned long)count,
                       (unsigned)dt.year, (unsigned)dt.month, (unsigned)dt.date,
                       (unsigned)dt.hour, (unsigned)dt.min, (unsigned)dt.sec);
      if (n > 0 && (size_t)n < sizeof(buf))
        (void)HAL_UART_Transmit(&huart3, (uint8_t *)buf, (uint16_t)(size_t)n, 200);
    }
    else
    {
      int n = snprintf(buf, sizeof(buf), "RTC: [%lu] read fail\r\n", (unsigned long)count);
      if (n > 0 && (size_t)n < sizeof(buf))
        (void)HAL_UART_Transmit(&huart3, (uint8_t *)buf, (uint16_t)(size_t)n, 200);
    }
    RTC_MARK("L3");   /* после вывода [n], перед count++ */
    count++;
  }
}
