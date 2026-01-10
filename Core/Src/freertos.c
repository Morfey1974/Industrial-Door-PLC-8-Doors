/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    freertos.c
  * @brief   Code for freertos applications
  *
  * Clean baseline for Stage 0–1:
  * - defaultTask: optional LwIP init + idle loop
  * - doorsTask  : runs StartDoorsTask() from App/doors
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
/* Optional: LwIP */
#include "lwip.h"

/* Our app task */
#include "doors_task.h"

#include "rs485_bringup.h"
#include "can_bringup.h"
#include "qspi_bringup.h"


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
osThreadId doorsTaskHandle;

/* Private function prototypes -----------------------------------------------*/
/* USER CODE BEGIN FunctionPrototypes */

/* USER CODE END FunctionPrototypes */

void StartDefaultTask(void const * argument);
void StartDoorsTask(void const * argument);

extern void MX_LWIP_Init(void);
void MX_FREERTOS_Init(void); /* (MISRA C 2004 rule 8.1) */

/* GetIdleTaskMemory prototype (linked to static allocation support) */
void vApplicationGetIdleTaskMemory( StaticTask_t **ppxIdleTaskTCBBuffer, StackType_t **ppxIdleTaskStackBuffer, uint32_t *pulIdleTaskStackSize );

/* USER CODE BEGIN GET_IDLE_TASK_MEMORY */
static StaticTask_t xIdleTaskTCBBuffer;
static StackType_t xIdleStack[configMINIMAL_STACK_SIZE];

void vApplicationGetIdleTaskMemory( StaticTask_t **ppxIdleTaskTCBBuffer, StackType_t **ppxIdleTaskStackBuffer, uint32_t *pulIdleTaskStackSize )
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
  /* USER CODE END RTOS_MUTEX */

  /* USER CODE BEGIN RTOS_SEMAPHORES */
  /* USER CODE END RTOS_SEMAPHORES */

  /* USER CODE BEGIN RTOS_TIMERS */
  /* USER CODE END RTOS_TIMERS */

  /* USER CODE BEGIN RTOS_QUEUES */
  /* USER CODE END RTOS_QUEUES */

  /* Create the thread(s) */
  /* definition and creation of defaultTask */
  osThreadDef(defaultTask, StartDefaultTask, osPriorityNormal, 0, 256);
  defaultTaskHandle = osThreadCreate(osThread(defaultTask), NULL);

  /* definition and creation of doorsTask */
  osThreadDef(doorsTask, StartDoorsTask, osPriorityAboveNormal, 0, 256);
  doorsTaskHandle = osThreadCreate(osThread(doorsTask), NULL);

  /* USER CODE BEGIN RTOS_THREADS */
  RS485_BringUp_Start();
  CAN_BringUp_Start();
  QSPI_BringUp_Start();


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
  /* init code for LWIP */
  MX_LWIP_Init();
  /* USER CODE BEGIN StartDefaultTask */


  for(;;)
  {
    osDelay(250);
  }
  /* USER CODE END StartDefaultTask */
}

/* USER CODE BEGIN Header_StartDoorsTask */
/**
* @brief Function implementing the doorsTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartDoorsTask */
void StartDoorsTask(void const * argument)
{
  /* USER CODE BEGIN StartDoorsTask */
  DoorsTask_Run(argument);
  /* USER CODE END StartDoorsTask */
}

/* Private application code --------------------------------------------------*/
/* USER CODE BEGIN Application */
/* USER CODE END Application */
