/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.h
  * @brief          : Header for main.c file.
  *                   This file contains the common defines of the application.
  ******************************************************************************
  * @attention
  *

  * Copyright (c) 2022 STMicroelectronics.

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

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "stm32h7xx_hal.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Exported types ------------------------------------------------------------*/
/* USER CODE BEGIN ET */

/* USER CODE END ET */

/* Exported constants --------------------------------------------------------*/
/* USER CODE BEGIN EC */

/* USER CODE END EC */

/* Exported macro ------------------------------------------------------------*/
/* USER CODE BEGIN EM */

/* USER CODE END EM */

/* Exported functions prototypes ---------------------------------------------*/
void Error_Handler(void);

/* USER CODE BEGIN EFP */
void CloseDoor1(void);
void OpenDoor1(void);
void CloseDoor2(void);
void OpenDoor2(void);
void CloseDoor3(void);
void OpenDoor3(void);
/* USER CODE END EFP */

/* Private defines -----------------------------------------------------------*/
#define OSC_IN_Pin GPIO_PIN_14
#define OSC_IN_GPIO_Port GPIOC
#define OSC_OUT_Pin GPIO_PIN_15
#define OSC_OUT_GPIO_Port GPIOC
#define CPULookDoor1_Pin GPIO_PIN_0
#define CPULookDoor1_GPIO_Port GPIOF
#define CPUBuzzerDoor1_Pin GPIO_PIN_1
#define CPUBuzzerDoor1_GPIO_Port GPIOF
#define CPULedGreenDoor1_Pin GPIO_PIN_2
#define CPULedGreenDoor1_GPIO_Port GPIOF
#define CPULedRedDoor1_Pin GPIO_PIN_3
#define CPULedRedDoor1_GPIO_Port GPIOF
#define CPUKeySensorDoor1_Pin GPIO_PIN_4
#define CPUKeySensorDoor1_GPIO_Port GPIOF
#define CPUKeyAlarmDoor1_Pin GPIO_PIN_5
#define CPUKeyAlarmDoor1_GPIO_Port GPIOF
#define CPULookDoor2_Pin GPIO_PIN_7
#define CPULookDoor2_GPIO_Port GPIOF
#define CPUBuzzerDoor2_Pin GPIO_PIN_0
#define CPUBuzzerDoor2_GPIO_Port GPIOC
#define RMII_MDC_Pin GPIO_PIN_1
#define RMII_MDC_GPIO_Port GPIOC
#define CPULedGreenDoor2_Pin GPIO_PIN_2
#define CPULedGreenDoor2_GPIO_Port GPIOC
#define CPULedRedDoor2_Pin GPIO_PIN_3
#define CPULedRedDoor2_GPIO_Port GPIOC
#define RMII_REF_CLK_Pin GPIO_PIN_1
#define RMII_REF_CLK_GPIO_Port GPIOA
#define RMII_MDIO_Pin GPIO_PIN_2
#define RMII_MDIO_GPIO_Port GPIOA
#define CPUKeySensorDoor2_Pin GPIO_PIN_3
#define CPUKeySensorDoor2_GPIO_Port GPIOA
#define CPUKeyAlarmDoor2_Pin GPIO_PIN_4
#define CPUKeyAlarmDoor2_GPIO_Port GPIOA
#define CPULookDoor3_Pin GPIO_PIN_5
#define CPULookDoor3_GPIO_Port GPIOA
#define CPUBuzzerDoor3_Pin GPIO_PIN_6
#define CPUBuzzerDoor3_GPIO_Port GPIOA
#define RMII_CRS_DV_Pin GPIO_PIN_7
#define RMII_CRS_DV_GPIO_Port GPIOA
#define RMII_RXD0_Pin GPIO_PIN_4
#define RMII_RXD0_GPIO_Port GPIOC
#define RMII_RXD1_Pin GPIO_PIN_5
#define RMII_RXD1_GPIO_Port GPIOC
#define CPULedGreenDoor3_Pin GPIO_PIN_0
#define CPULedGreenDoor3_GPIO_Port GPIOB
#define CPULedRedDoor3_Pin GPIO_PIN_1
#define CPULedRedDoor3_GPIO_Port GPIOB
#define CPUKeySensorDoor3_Pin GPIO_PIN_2
#define CPUKeySensorDoor3_GPIO_Port GPIOB
#define CPUKeyAlarmDoor3_Pin GPIO_PIN_11
#define CPUKeyAlarmDoor3_GPIO_Port GPIOF
#define CPULookDoor4_Pin GPIO_PIN_12
#define CPULookDoor4_GPIO_Port GPIOF
#define CPUBuzzerDoor4_Pin GPIO_PIN_13
#define CPUBuzzerDoor4_GPIO_Port GPIOF
#define CPULedGreenDoor4_Pin GPIO_PIN_14
#define CPULedGreenDoor4_GPIO_Port GPIOF
#define CPULedRedDoor4_Pin GPIO_PIN_15
#define CPULedRedDoor4_GPIO_Port GPIOF
#define CPUKeySensorDoor4_Pin GPIO_PIN_0
#define CPUKeySensorDoor4_GPIO_Port GPIOG
#define CPUKeyAlarmDoor4_Pin GPIO_PIN_1
#define CPUKeyAlarmDoor4_GPIO_Port GPIOG
#define CPULookDoor5_Pin GPIO_PIN_7
#define CPULookDoor5_GPIO_Port GPIOE
#define CPUBuzzerDoor5_Pin GPIO_PIN_8
#define CPUBuzzerDoor5_GPIO_Port GPIOE
#define CPULedGreenDoor5_Pin GPIO_PIN_9
#define CPULedGreenDoor5_GPIO_Port GPIOE
#define CPULedRedDoor5_Pin GPIO_PIN_10
#define CPULedRedDoor5_GPIO_Port GPIOE
#define CPUKeySensorDoor5_Pin GPIO_PIN_12
#define CPUKeySensorDoor5_GPIO_Port GPIOE
#define CPUKeyAlarmDoor5_Pin GPIO_PIN_13
#define CPUKeyAlarmDoor5_GPIO_Port GPIOE
#define CPULookDoor6_Pin GPIO_PIN_14
#define CPULookDoor6_GPIO_Port GPIOE
#define CPUBuzzerDoor6_Pin GPIO_PIN_15
#define CPUBuzzerDoor6_GPIO_Port GPIOE
#define CPULedGreenDoor6_Pin GPIO_PIN_10
#define CPULedGreenDoor6_GPIO_Port GPIOB
#define CPULedRedDoor6_Pin GPIO_PIN_11
#define CPULedRedDoor6_GPIO_Port GPIOB
#define CPUKeySensorDoor6_Pin GPIO_PIN_12
#define CPUKeySensorDoor6_GPIO_Port GPIOB
#define RMII_TXD1_Pin GPIO_PIN_13
#define RMII_TXD1_GPIO_Port GPIOB
#define CPUKeyAlarmDoor6_Pin GPIO_PIN_14
#define CPUKeyAlarmDoor6_GPIO_Port GPIOB
#define CPULookDoor7_Pin GPIO_PIN_15
#define CPULookDoor7_GPIO_Port GPIOB
#define USART3_TX_Pin GPIO_PIN_8
#define USART3_TX_GPIO_Port GPIOD
#define USART3_RX_Pin GPIO_PIN_9
#define USART3_RX_GPIO_Port GPIOD
#define CPUBuzzerDoor7_Pin GPIO_PIN_10
#define CPUBuzzerDoor7_GPIO_Port GPIOD
#define CPULedGreenDoor7_Pin GPIO_PIN_11
#define CPULedGreenDoor7_GPIO_Port GPIOD
#define CPULedRedDoor7_Pin GPIO_PIN_12
#define CPULedRedDoor7_GPIO_Port GPIOD
#define CPUKeySensorDoor7_Pin GPIO_PIN_13
#define CPUKeySensorDoor7_GPIO_Port GPIOD
#define CPUKeyAlarmDoor7_Pin GPIO_PIN_14
#define CPUKeyAlarmDoor7_GPIO_Port GPIOD
#define CPULookDoor8_Pin GPIO_PIN_15
#define CPULookDoor8_GPIO_Port GPIOD
#define CPUBuzzerDoor8_Pin GPIO_PIN_2
#define CPUBuzzerDoor8_GPIO_Port GPIOG
#define CPULedGreenDoor8_Pin GPIO_PIN_3
#define CPULedGreenDoor8_GPIO_Port GPIOG
#define CPULedRedDoor8_Pin GPIO_PIN_4
#define CPULedRedDoor8_GPIO_Port GPIOG
#define CPUKeySensorDoor8_Pin GPIO_PIN_5
#define CPUKeySensorDoor8_GPIO_Port GPIOG
#define CPUKeyAlarmDoor8_Pin GPIO_PIN_6
#define CPUKeyAlarmDoor8_GPIO_Port GPIOG
#define SWDIO_Pin GPIO_PIN_13
#define SWDIO_GPIO_Port GPIOA
#define SWCLK_Pin GPIO_PIN_14
#define SWCLK_GPIO_Port GPIOA
#define RMII_TX_EN_Pin GPIO_PIN_11
#define RMII_TX_EN_GPIO_Port GPIOG
#define RMII_TXD0_Pin GPIO_PIN_13
#define RMII_TXD0_GPIO_Port GPIOG

/* USER CODE BEGIN Private defines */

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
