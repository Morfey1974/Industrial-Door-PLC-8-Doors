/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * File Name          : freertos.c
  * Description        : Code for freertos applications
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
#include "FreeRTOS.h"
#include "task.h"
#include "main.h"
#include "cmsis_os.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

#include "fdcan.h"
#include "usart.h"
#include <stdio.h>
#include <doors.h>
#include "modbus.h"





/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
/* USER CODE BEGIN Variables */

/* USER CODE END Variables */
osThreadId defaultTaskHandle;

/* Private function prototypes -----------------------------------------------*/
/* USER CODE BEGIN FunctionPrototypes */

static void CAN_Debug_Init(void);
static void CAN_Debug_Step(void);

/* ================= DEBUG: мониторинг стека задачи =================
 *
 *  Эта функция выводит в терминал оценку использования стека
 *  для ТЕКУЩЕЙ задачи (той, из которой она вызвана).
 *
 *  Основана на uxTaskGetStackHighWaterMark():
 *  - возвращает минимальный свободный запас стека (в словах),
 *    который был за всё время работы задачи;
 *  - по нему можно посчитать, сколько стека максимально было занято.
 *
 *  Параметры:
 *    taskName        - человекочитаемое имя задачи (для лога)
 *    stackSizeWords  - размер стека задачи в СЛОВАХ (как в osThreadDef)
 *
 *  ВАЖНО:
 *    - Это чисто отладочная функция. Её можно удалить безболезненно:
 *      она не меняет логику задач, только печатает в UART.
 *    - Для работы нужен INCLUDE_uxTaskGetStackHighWaterMark == 1
 *      в FreeRTOSConfig.h.
 * ==================================================================*/
static void Debug_PrintCurrentTaskStackUsage(const char *taskName,
                                             uint32_t stackSizeWords)
{
#if (INCLUDE_uxTaskGetStackHighWaterMark == 1)

    // Минимально оставшийся (максимально использованный) запас стека, в СЛОВАХ
    UBaseType_t highWater = uxTaskGetStackHighWaterMark(NULL);

    uint32_t freeWords = (uint32_t)highWater;
    uint32_t usedWords = (stackSizeWords > freeWords) ? (stackSizeWords - freeWords) : 0U;

    uint32_t totalBytes = stackSizeWords * sizeof(StackType_t);
    uint32_t usedBytes  = usedWords      * sizeof(StackType_t);
    uint32_t freeBytes  = freeWords      * sizeof(StackType_t);

    uint32_t usedPercent = (stackSizeWords > 0U)
                           ? (usedWords * 100U / stackSizeWords)
                           : 0U;

    char dbg[160];

    // Один аккуратный лог с подробной статистикой
    snprintf(dbg, sizeof(dbg),
             "[STACK] Task '%s': total=%lu words (%lu bytes), "
             "used(max)=%lu words (%lu bytes, %lu%%), "
             "free(min)=%lu words (%lu bytes)\r\n",
             (taskName != NULL) ? taskName : "unknown",
             (unsigned long)stackSizeWords,
             (unsigned long)totalBytes,
             (unsigned long)usedWords,
             (unsigned long)usedBytes,
             (unsigned long)usedPercent,
             (unsigned long)freeWords,
             (unsigned long)freeBytes);

    Debug_Print(dbg);

#else
    (void)taskName;
    (void)stackSizeWords;
    Debug_Print("[STACK] uxTaskGetStackHighWaterMark() disabled in FreeRTOSConfig.h\r\n");
#endif
}


/* USER CODE END FunctionPrototypes */

void StartDefaultTask(void const * argument);

void MX_FREERTOS_Init(void); /* (MISRA C 2004 rule 8.1) */

/* GetIdleTaskMemory prototype (linked to static allocation support) */
void vApplicationGetIdleTaskMemory( StaticTask_t **ppxIdleTaskTCBBuffer, StackType_t **ppxIdleTaskStackBuffer, uint32_t *pulIdleTaskStackSize );

/* USER CODE BEGIN GET_IDLE_TASK_MEMORY */
static StaticTask_t xIdleTaskTCBBuffer;
static StackType_t xIdleStack[configMINIMAL_STACK_SIZE];

void vApplicationGetIdleTaskMemory( StaticTask_t **ppxIdleTaskTCBBuffer,
                                    StackType_t **ppxIdleTaskStackBuffer,
                                    uint32_t *pulIdleTaskStackSize )
{
  *ppxIdleTaskTCBBuffer = &xIdleTaskTCBBuffer;
  *ppxIdleTaskStackBuffer = &xIdleStack[0];
  *pulIdleTaskStackSize = configMINIMAL_STACK_SIZE;
  /* place for user code */
}
/* USER CODE END GET_IDLE_TASK_MEMORY */

/**
  * @brief  FreeRTOS initialization
  * @param  None
  * @retval None
  */
void MX_FREERTOS_Init(void) {
  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* USER CODE BEGIN RTOS_MUTEX */
  /* add mutexes, . */
  /* USER CODE END RTOS_MUTEX */

  /* USER CODE BEGIN RTOS_SEMAPHORES */
  /* add semaphores, . */
  /* USER CODE END RTOS_SEMAPHORES */

  /* USER CODE BEGIN RTOS_TIMERS */
  /* start timers, add new ones, . */
  /* USER CODE END RTOS_TIMERS */

  /* USER CODE BEGIN RTOS_QUEUES */
  /* add queues, . */
  /* USER CODE END RTOS_QUEUES */

  /* Create the thread(s) */
  /* definition and creation of defaultTask */
  osThreadDef(defaultTask, StartDefaultTask, osPriorityNormal, 0, 128);
  defaultTaskHandle = osThreadCreate(osThread(defaultTask), NULL);

  /* USER CODE BEGIN RTOS_THREADS */
  /* add threads, . */
  /* USER CODE END RTOS_THREADS */

}

/* USER CODE BEGIN Header_StartDefaultTask */
/**
  * @brief  Function implementing the defaultTask thread.
  * @param  argument: Not used
  * @retval None
  */
/* USER CODE END Header_StartDefaultTask */
void StartDefaultTask(void const * argument)
{
  /* USER CODE BEGIN StartDefaultTask */

  // Инициализация CAN для обмена состоянием дверей
  CAN_Debug_Init();

  uint32_t stackDbgCounter = 0;

  for(;;)
  {
    // Раз в секунду выводим использование стека этой задачи (по желанию)
    if ((stackDbgCounter % 20U) == 0U)
    {
        Debug_PrintCurrentTaskStackUsage("defaultTask", 256U);
    }
    stackDbgCounter++;

    // Основная работа: CAN + перекрёстная логика дверей
    CAN_Debug_Step();

    // Период ~50 мс: быстрый отклик замков и достаточно частый обмен по CAN
    osDelay(50);
  }

  /* USER CODE END StartDefaultTask */
}

/* Private application code --------------------------------------------------*/
/* USER CODE BEGIN Application */

/**
  * @brief  Настройка фильтров и запуск FDCAN1 для теста.
  */
static void CAN_Debug_Init(void)
{
  FDCAN_FilterTypeDef sFilterConfig;

  // Обычный стандартный фильтр: принять ВСЕ стандартные ID в FIFO0
  sFilterConfig.IdType       = FDCAN_STANDARD_ID;
  sFilterConfig.FilterIndex  = 0;
  sFilterConfig.FilterType   = FDCAN_FILTER_RANGE_NO_EIDM;
  sFilterConfig.FilterConfig = FDCAN_FILTER_TO_RXFIFO0;
  sFilterConfig.FilterID1    = 0x000;
  sFilterConfig.FilterID2    = 0x7FF;

  if (HAL_FDCAN_ConfigFilter(&hfdcan1, &sFilterConfig) != HAL_OK)
  {
    Error_Handler();
  }

  // Нестандартные ID тоже в FIFO0, remote-кадры игнорируем
  if (HAL_FDCAN_ConfigGlobalFilter(&hfdcan1,
                                   FDCAN_ACCEPT_IN_RX_FIFO0,  // несоответствующие std
                                   FDCAN_ACCEPT_IN_RX_FIFO0,  // несоответствующие ext
                                   DISABLE,                   // remote std
                                   DISABLE) != HAL_OK)        // remote ext
  {
    Error_Handler();
  }

  // Запуск контроллера
  if (HAL_FDCAN_Start(&hfdcan1) != HAL_OK)
  {
    Error_Handler();
  }
}




static void CAN_Debug_Step(void)
{
    static uint8_t remoteOpen = 0;  // 1 = удалённая дверь физически ОТКРЫТА, 0 = закрыта/неизвестно

    /* 1. Локальное состояние двери 1 по датчику
     *    В doors.c: physClosed = (KeySensorDoor1 == GPIO_PIN_RESET)
     *    Значит: RESET = закрыта, SET = открыта.
     */
    GPIO_PinState sensorState = KeySensorDoor1;
    uint8_t localClosed = (sensorState == GPIO_PIN_RESET) ? 1U : 0U;
    uint8_t localOpen   = localClosed ? 0U : 1U;

    /* 2. Формируем и отправляем CAN кадр: doorIdx + localOpen (1 = открыта) */
    FDCAN_TxHeaderTypeDef TxHeader;
    uint8_t txData[8] = {0};

    TxHeader.Identifier           = 0x123;               // общий ID
    TxHeader.IdType               = FDCAN_STANDARD_ID;
    TxHeader.TxFrameType          = FDCAN_DATA_FRAME;
    TxHeader.DataLength           = FDCAN_DLC_BYTES_2;   // 2 байта
    TxHeader.ErrorStateIndicator  = FDCAN_ESI_ACTIVE;
    TxHeader.BitRateSwitch        = FDCAN_BRS_OFF;
    TxHeader.FDFormat             = FDCAN_CLASSIC_CAN;
    TxHeader.TxEventFifoControl   = FDCAN_NO_TX_EVENTS;
    TxHeader.MessageMarker        = 0;

    txData[0] = 1U;          // doorIdx = 1
    txData[1] = localOpen;   // 0 = закрыта, 1 = открыта

    (void)HAL_FDCAN_AddMessageToTxFifoQ(&hfdcan1, &TxHeader, txData);

    /* 3. Приём всех кадров и обновление remoteOpen */
    FDCAN_RxHeaderTypeDef RxHeader;
    uint8_t rxData[8];

    while (HAL_FDCAN_GetRxFifoFillLevel(&hfdcan1, FDCAN_RX_FIFO0) > 0)
    {
        if (HAL_FDCAN_GetRxMessage(&hfdcan1, FDCAN_RX_FIFO0, &RxHeader, rxData) == HAL_OK)
        {
            uint8_t dlc = (uint8_t)(RxHeader.DataLength & 0xF);
            if (dlc > 1U && rxData[0] == 1U)
            {
                remoteOpen = rxData[1];   // 1 = удалённая дверь открыта
            }
        }
        else
        {
            // Ошибка приёма — просто выходим, без логов
            break;
        }
    }

    /* 4. Перекрёстная логика Door1
     *
     *   localClosed  = 1, если наша дверь физически закрыта
     *   remoteOpen   = 1, если удалённая физически открыта
     *   remoteClosed = !remoteOpen
     *
     *   Правило:
     *     - если обе ФИЗИЧЕСКИ закрыты -> наша дверь разблокирована (Door1_Open)
     *     - если сосед открыл свою -> наша (закрытая) должна заблокироваться (Door1_Close)
     */

    uint8_t remoteClosed = remoteOpen ? 0U : 1U;

    if (localClosed && remoteClosed)
    {
        // Обе закрыты -> нашу дверь разблокируем (зелёный, замок отпущен)
        Door1_Open();
    }
    else
    {
        if (localClosed && !remoteClosed)
        {
            // Я закрыт, сосед открыт -> я должен быть ЗАБЛОКИРОВАН
            Door1_Close();
        }
        else
        {
            // Я сам открыт (неважно, что у соседа) -> оставляю себя разблокированной
            Door1_Open();
        }
    }
}





/* USER CODE END Application */
