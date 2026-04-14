/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    usart.c
  * @brief   This file provides code for the configuration
  *          of the USART instances.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2025 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "usart.h"

/* USER CODE BEGIN 0 */
#include <string.h>

#include "FreeRTOS.h"

/* UART3 CLI / тестовая консоль (Этап 7.4)
 * ------------------------------------------------------------
 * Цель: обеспечить стабильные команды через UART3:
 *   log stat / log dump N / log clear / log help
 *
 * Принцип:
 *  - Приём в usart.c только «доставляет байты» (ReceiveToIdle_IT)
 *  - Разбор строки и выполнение команды — в app_log_uart3.c
 *  - Выполнение НЕ в IRQ (важно!), а в контексте задачи через AppLog_Uart3_ProcessPending()

 *
 * Так CLI:
 *  - не зависит от терминала/эхо
 *  - не ломается при регенерации CubeMX (всё в USER CODE)
 */

/* Прототипы объявляем здесь (CubeMX-safe).
 * app_log_uart3.h может быть минимальным/пустым, поэтому не полагаемся на него.
 */
#include "app_log_uart3.h"
extern void AppLog_Uart3_OnRxBytes(const uint8_t *data, size_t len, BaseType_t in_isr);
extern void AppLog_Uart3_ResetParserFromISR(void);

#define UART3_RX_CHUNK  64u

static uint8_t s_uart3_rx_chunk[UART3_RX_CHUNK];
/* USER CODE END 0 */

UART_HandleTypeDef huart3;

/* USART3 init function */

void MX_USART3_UART_Init(void)
{

  /* USER CODE BEGIN USART3_Init 0 */

  /* USER CODE END USART3_Init 0 */

  /* USER CODE BEGIN USART3_Init 1 */

  /* USER CODE END USART3_Init 1 */
  huart3.Instance = USART3;
  huart3.Init.BaudRate = 115200;
  huart3.Init.WordLength = UART_WORDLENGTH_8B;
  huart3.Init.StopBits = UART_STOPBITS_1;
  huart3.Init.Parity = UART_PARITY_NONE;
  huart3.Init.Mode = UART_MODE_TX_RX;
  huart3.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart3.Init.OverSampling = UART_OVERSAMPLING_16;
  huart3.Init.OneBitSampling = UART_ONE_BIT_SAMPLE_DISABLE;
  huart3.Init.ClockPrescaler = UART_PRESCALER_DIV1;
  huart3.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;
  if (HAL_UART_Init(&huart3) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_UARTEx_SetTxFifoThreshold(&huart3, UART_TXFIFO_THRESHOLD_1_8) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_UARTEx_SetRxFifoThreshold(&huart3, UART_RXFIFO_THRESHOLD_1_8) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_UARTEx_DisableFifoMode(&huart3) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART3_Init 2 */
  /* UART3 CLI: запускаем приём в фоне (idle-line).
   * Важно вызывать после HAL_UART_Init().
   */
  (void)HAL_UARTEx_ReceiveToIdle_IT(&huart3, s_uart3_rx_chunk, UART3_RX_CHUNK);
  /* USER CODE END USART3_Init 2 */

}

void HAL_UART_MspInit(UART_HandleTypeDef* uartHandle)
{

  GPIO_InitTypeDef GPIO_InitStruct = {0};
  RCC_PeriphCLKInitTypeDef PeriphClkInitStruct = {0};
  if(uartHandle->Instance==USART3)
  {
  /* USER CODE BEGIN USART3_MspInit 0 */

  /* USER CODE END USART3_MspInit 0 */

  /** Initializes the peripherals clock
  */
    PeriphClkInitStruct.PeriphClockSelection = RCC_PERIPHCLK_USART3;
    PeriphClkInitStruct.Usart234578ClockSelection = RCC_USART234578CLKSOURCE_D2PCLK1;
    if (HAL_RCCEx_PeriphCLKConfig(&PeriphClkInitStruct) != HAL_OK)
    {
      Error_Handler();
    }

    /* USART3 clock enable */
    __HAL_RCC_USART3_CLK_ENABLE();

    __HAL_RCC_GPIOD_CLK_ENABLE();
    /**USART3 GPIO Configuration
    PD8     ------> USART3_TX
    PD9     ------> USART3_RX
    */
    GPIO_InitStruct.Pin = USART3_TX_Pin|USART3_RX_Pin;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    GPIO_InitStruct.Alternate = GPIO_AF7_USART3;
    HAL_GPIO_Init(GPIOD, &GPIO_InitStruct);

    /* USART3 interrupt Init */
    HAL_NVIC_SetPriority(USART3_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(USART3_IRQn);
  /* USER CODE BEGIN USART3_MspInit 1 */
    /* Включаем NVIC для USART3.
       * Без этого HAL_UART_IRQHandler() никогда не вызывается,
       * и UART3 CLI (ReceiveToIdle_IT) не работает.
       *
       * Приоритет ниже, чем у FreeRTOS syscall (безопасно).
       */
      HAL_NVIC_SetPriority(USART3_IRQn, 7, 0);
      HAL_NVIC_EnableIRQ(USART3_IRQn);
  /* USER CODE END USART3_MspInit 1 */
  }
}

void HAL_UART_MspDeInit(UART_HandleTypeDef* uartHandle)
{

  if(uartHandle->Instance==USART3)
  {
  /* USER CODE BEGIN USART3_MspDeInit 0 */

  /* USER CODE END USART3_MspDeInit 0 */
    /* Peripheral clock disable */
    __HAL_RCC_USART3_CLK_DISABLE();

    /**USART3 GPIO Configuration
    PD8     ------> USART3_TX
    PD9     ------> USART3_RX
    */
    HAL_GPIO_DeInit(GPIOD, USART3_TX_Pin|USART3_RX_Pin);

    /* USART3 interrupt Deinit */
    HAL_NVIC_DisableIRQ(USART3_IRQn);
  /* USER CODE BEGIN USART3_MspDeInit 1 */

  /* USER CODE END USART3_MspDeInit 1 */
  }
}

/* USER CODE BEGIN 1 */

/*
 * USART3 printf retarget
 * ---------------------
 * Cube-generated syscalls.c implements _write() by calling __io_putchar().
 * By defining __io_putchar() here, we make plain printf() go to USART3.
 *
 * Why here?
 * - usart.c is already part of the project and is not replaced inside USER CODE.
 * - avoids touching syscalls.c (Cube may regenerate it).
 */
int __io_putchar(int ch)
{
    uint8_t c = (uint8_t)ch;
    (void)HAL_UART_Transmit(&huart3, &c, 1, HAL_MAX_DELAY);
    return ch;
}

void Debug_Print(const char *s)
{
    if (s == NULL) return;
    HAL_UART_Transmit(&huart3, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
}

/* ---------------- UART3 CLI: обработка приёма ----------------
 * Вызывается HAL-ом при событии IDLE (пауза в приёме).
 * Сюда приходят куски данных, из которых собирается строка команды.
 */
void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size)
{
    if (huart == NULL) return;

    if (huart->Instance == USART3)
    {
        /* Передаём «сырые» байты в модуль CLI.
         * Там уже:
         *  - сборка строки
         *  - фильтрация ESC/управляющих
         *  - запуск выполнения команды НЕ в IRQ
         */



        AppLog_Uart3_OnRxBytes(s_uart3_rx_chunk, (size_t)Size, pdTRUE);
        AppLog_Uart3_OnRxIdle(pdTRUE);




        /* Перезапускаем приём (ReceiveToIdle_IT одноразовый). */
        (void)HAL_UARTEx_ReceiveToIdle_IT(&huart3, s_uart3_rx_chunk, UART3_RX_CHUNK);
    }
}

/* На ошибках UART перезапускаем приём, чтобы CLI не “умирал” */
void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart)
{
    if (huart == NULL) return;

    if (huart->Instance == USART3)
    {
        /* Сбросим внутренний парсер, чтобы после ошибки не осталась «половина команды». */
        AppLog_Uart3_ResetParserFromISR();
        (void)HAL_UARTEx_ReceiveToIdle_IT(&huart3, s_uart3_rx_chunk, UART3_RX_CHUNK);
    }
}

/* USER CODE END 1 */
