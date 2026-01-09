/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    gpio.c
  * @brief   This file provides code for the configuration
  *          of all used GPIO pins.
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
#include "gpio.h"

/* USER CODE BEGIN 0 */

/* USER CODE END 0 */

/*----------------------------------------------------------------------------*/
/* Configure GPIO                                                             */
/*----------------------------------------------------------------------------*/
/* USER CODE BEGIN 1 */

/* USER CODE END 1 */

/** Configure pins as
        * Analog
        * Input
        * Output
        * EVENT_OUT
        * EXTI
*/
void MX_GPIO_Init(void)
{

  GPIO_InitTypeDef GPIO_InitStruct = {0};

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOE_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOF_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  __HAL_RCC_GPIOG_CLK_ENABLE();
  __HAL_RCC_GPIOD_CLK_ENABLE();

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOF, CPULookDoor1_Pin|CPUBuzzerDoor1_Pin|CPULedGreenDoor1_Pin|CPULedRedDoor1_Pin
                          |CPULookDoor2_Pin|CPULookDoor4_Pin|CPUBuzzerDoor4_Pin|CPULedGreenDoor4_Pin
                          |CPULedRedDoor4_Pin, GPIO_PIN_SET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOC, CPUBuzzerDoor2_Pin|CPULedGreenDoor2_Pin|CPULedRedDoor2_Pin, GPIO_PIN_SET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOA, CPULookDoor3_Pin|CPUBuzzerDoor3_Pin, GPIO_PIN_SET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOB, CPULedGreenDoor3_Pin|CPULedRedDoor3_Pin|CPULedGreenDoor6_Pin|CPULedRedDoor6_Pin
                          |CPULookDoor7_Pin, GPIO_PIN_SET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOE, CPULookDoor5_Pin|CPUBuzzerDoor5_Pin|CPULedGreenDoor5_Pin|CPULedRedDoor5_Pin
                          |CPULookDoor6_Pin|CPUBuzzerDoor6_Pin, GPIO_PIN_SET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOD, CPUBuzzerDoor7_Pin|CPULedGreenDoor7_Pin|CPULedRedDoor7_Pin|CPULookDoor8_Pin, GPIO_PIN_SET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOG, CPUBuzzerDoor8_Pin|CPULedGreenDoor8_Pin|CPULedRedDoor8_Pin, GPIO_PIN_SET);

  /*Configure GPIO pins : CPULookDoor1_Pin CPUBuzzerDoor1_Pin CPULedGreenDoor1_Pin CPULedRedDoor1_Pin
                           CPULookDoor2_Pin CPULookDoor4_Pin CPUBuzzerDoor4_Pin CPULedGreenDoor4_Pin
                           CPULedRedDoor4_Pin */
  GPIO_InitStruct.Pin = CPULookDoor1_Pin|CPUBuzzerDoor1_Pin|CPULedGreenDoor1_Pin|CPULedRedDoor1_Pin
                          |CPULookDoor2_Pin|CPULookDoor4_Pin|CPUBuzzerDoor4_Pin|CPULedGreenDoor4_Pin
                          |CPULedRedDoor4_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOF, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUKeySensorDoor1_Pin CPUKeyAlarmDoor1_Pin CPUKeyAlarmDoor3_Pin */
  GPIO_InitStruct.Pin = CPUKeySensorDoor1_Pin|CPUKeyAlarmDoor1_Pin|CPUKeyAlarmDoor3_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOF, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUBuzzerDoor2_Pin CPULedGreenDoor2_Pin CPULedRedDoor2_Pin */
  GPIO_InitStruct.Pin = CPUBuzzerDoor2_Pin|CPULedGreenDoor2_Pin|CPULedRedDoor2_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUKeySensorDoor2_Pin CPUKeyAlarmDoor2_Pin */
  GPIO_InitStruct.Pin = CPUKeySensorDoor2_Pin|CPUKeyAlarmDoor2_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pins : CPULookDoor3_Pin CPUBuzzerDoor3_Pin */
  GPIO_InitStruct.Pin = CPULookDoor3_Pin|CPUBuzzerDoor3_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pins : CPULedGreenDoor3_Pin CPULedRedDoor3_Pin CPULedGreenDoor6_Pin CPULedRedDoor6_Pin
                           CPULookDoor7_Pin */
  GPIO_InitStruct.Pin = CPULedGreenDoor3_Pin|CPULedRedDoor3_Pin|CPULedGreenDoor6_Pin|CPULedRedDoor6_Pin
                          |CPULookDoor7_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUKeySensorDoor3_Pin CPUKeySensorDoor6_Pin CPUKeyAlarmDoor6_Pin */
  GPIO_InitStruct.Pin = CPUKeySensorDoor3_Pin|CPUKeySensorDoor6_Pin|CPUKeyAlarmDoor6_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUKeySensorDoor4_Pin CPUKeyAlarmDoor4_Pin CPUKeySensorDoor8_Pin CPUKeyAlarmDoor8_Pin */
  GPIO_InitStruct.Pin = CPUKeySensorDoor4_Pin|CPUKeyAlarmDoor4_Pin|CPUKeySensorDoor8_Pin|CPUKeyAlarmDoor8_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOG, &GPIO_InitStruct);

  /*Configure GPIO pins : CPULookDoor5_Pin CPUBuzzerDoor5_Pin CPULedGreenDoor5_Pin CPULedRedDoor5_Pin
                           CPULookDoor6_Pin CPUBuzzerDoor6_Pin */
  GPIO_InitStruct.Pin = CPULookDoor5_Pin|CPUBuzzerDoor5_Pin|CPULedGreenDoor5_Pin|CPULedRedDoor5_Pin
                          |CPULookDoor6_Pin|CPUBuzzerDoor6_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOE, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUKeySensorDoor5_Pin CPUKeyAlarmDoor5_Pin */
  GPIO_InitStruct.Pin = CPUKeySensorDoor5_Pin|CPUKeyAlarmDoor5_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOE, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUBuzzerDoor7_Pin CPULedGreenDoor7_Pin CPULedRedDoor7_Pin CPULookDoor8_Pin */
  GPIO_InitStruct.Pin = CPUBuzzerDoor7_Pin|CPULedGreenDoor7_Pin|CPULedRedDoor7_Pin|CPULookDoor8_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOD, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUKeySensorDoor7_Pin CPUKeyAlarmDoor7_Pin */
  GPIO_InitStruct.Pin = CPUKeySensorDoor7_Pin|CPUKeyAlarmDoor7_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIOD, &GPIO_InitStruct);

  /*Configure GPIO pins : CPUBuzzerDoor8_Pin CPULedGreenDoor8_Pin CPULedRedDoor8_Pin */
  GPIO_InitStruct.Pin = CPUBuzzerDoor8_Pin|CPULedGreenDoor8_Pin|CPULedRedDoor8_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOG, &GPIO_InitStruct);

  /*AnalogSwitch Config */
  HAL_SYSCFG_AnalogSwitchConfig(SYSCFG_SWITCH_PC2, SYSCFG_SWITCH_PC2_CLOSE);

  /*AnalogSwitch Config */
  HAL_SYSCFG_AnalogSwitchConfig(SYSCFG_SWITCH_PC3, SYSCFG_SWITCH_PC3_CLOSE);

}

/* USER CODE BEGIN 2 */

/* USER CODE END 2 */
