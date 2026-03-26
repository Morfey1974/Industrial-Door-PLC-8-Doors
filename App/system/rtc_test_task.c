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

#define RTC_TEST_PERIOD_MS  2000u   /* период вывода, мс */

void StartRtcTestTask(void *argument)
{
  (void)argument;
  ds3231_datetime_t dt;

  /* Периодика в цикле задачи (тик идёт из TIM6 в main.c) */
  for (;;)
  {
    vTaskDelay(pdMS_TO_TICKS(RTC_TEST_PERIOD_MS));
    /* Чтение RTC оставлено, чтобы сохранить "живой" проход по I2C в фоне,
     * но UART-вывод отключён полностью, чтобы не засорять лог контроллера.
     */
    (void)DS3231_ReadDateTime(&dt);
  }
}
