/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    freertos.c
  * @brief   RTOS stage-2 skeleton (tasks + event bus + supervisor)
  *
  * ЭТАП 2 по плану:
  * - 4 задачи: Door / Comms / Net / Supervisor
  * - единая очередь событий (EventBus)
  * - Health/Heartbeat + safe-state (Supervisor)
  *
  * ВАЖНО:
  * - Никакие модули (LwIP bring-up и т.п.) НЕ создают задачи изнутри.
  * - Все osThreadCreate() только здесь.
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
#include "app_events.h"
#include "app_health.h"

#include "doors_task.h"      /* App/doors */
#include "comms_task.h"      /* App/system */
#include "net_task.h"        /* App/system */
#include "supervisor_task.h" /* App/system */
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
osThreadId netTaskHandle;
osThreadId commsTaskHandle;
osThreadId doorsTaskHandle;
osThreadId supervisorTaskHandle;

/* Private function prototypes -----------------------------------------------*/
/* USER CODE BEGIN FunctionPrototypes */

/* USER CODE END FunctionPrototypes */

void StartNetTask(void const * argument);
void StartCommsTask(void const * argument);
void StartDoorsTask(void const * argument);
void StartSupervisorTask(void const * argument);

extern void MX_LWIP_Init(void);
void MX_FREERTOS_Init(void); /* (MISRA C 2004 rule 8.1) */

/* GetIdleTaskMemory prototype (linked to static allocation support) */
void vApplicationGetIdleTaskMemory( StaticTask_t **ppxIdleTaskTCBBuffer, StackType_t **ppxIdleTaskStackBuffer, uint32_t *pulIdleTaskStackSize );

/* USER CODE BEGIN GET_IDLE_TASK_MEMORY */
static StaticTask_t xIdleTaskTCBBuffer;
static StackType_t xIdleStack[configMINIMAL_STACK_SIZE];

void vApplicationGetIdleTaskMemory(StaticTask_t **ppxIdleTaskTCBBuffer,
                                   StackType_t **ppxIdleTaskStackBuffer,
                                   uint32_t *pulIdleTaskStackSize)
{
  *ppxIdleTaskTCBBuffer   = &xIdleTaskTCBBuffer;
  *ppxIdleTaskStackBuffer = &xIdleStack[0];
  *pulIdleTaskStackSize   = configMINIMAL_STACK_SIZE;
}
/* USER CODE END GET_IDLE_TASK_MEMORY */

/**
  * @brief  FreeRTOS initialization
  * @param  None
  * @retval None
  */
void MX_FREERTOS_Init(void) {
  /* USER CODE BEGIN Init */
  AppEvents_Init();
  AppHealth_Init();
  /* USER CODE END Init */

  /* USER CODE BEGIN RTOS_MUTEX */
  /* add mutexes, ... */
  /* USER CODE END RTOS_MUTEX */

  /* USER CODE BEGIN RTOS_SEMAPHORES */
  /* add semaphores, ... */
  /* USER CODE END RTOS_SEMAPHORES */

  /* USER CODE BEGIN RTOS_TIMERS */
  /* start timers, add new ones, ... */
  /* USER CODE END RTOS_TIMERS */

  /* USER CODE BEGIN RTOS_QUEUES */
  /* add queues, ... */
  /* USER CODE END RTOS_QUEUES */

  /* Create the thread(s) */
  /* definition and creation of netTask */
  osThreadDef(netTask, StartNetTask, osPriorityLow, 0, 768);
  netTaskHandle = osThreadCreate(osThread(netTask), NULL);

  /* definition and creation of commsTask */
  osThreadDef(commsTask, StartCommsTask, osPriorityNormal, 0, 512);
  commsTaskHandle = osThreadCreate(osThread(commsTask), NULL);

  /* definition and creation of doorsTask */
  osThreadDef(doorsTask, StartDoorsTask, osPriorityAboveNormal, 0, 512);
  doorsTaskHandle = osThreadCreate(osThread(doorsTask), NULL);

  /* definition and creation of supervisorTask */
  osThreadDef(supervisorTask, StartSupervisorTask, osPriorityHigh, 0, 512);
  supervisorTaskHandle = osThreadCreate(osThread(supervisorTask), NULL);

  /* USER CODE BEGIN RTOS_THREADS */

  /* USER CODE END RTOS_THREADS */

}

/* USER CODE BEGIN Header_StartNetTask */
/**
* @brief Function implementing the netTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartNetTask */
void StartNetTask(void const * argument)
{
  /* init code for LWIP */
  MX_LWIP_Init();

  /* USER CODE BEGIN StartNetTask */
  NetTask_Run(argument);

  /* Если сюда дошли — это ошибка: NetTask_Run должен быть вечным */
  configASSERT(0);
  /* USER CODE END StartNetTask */
}


/* USER CODE BEGIN Header_StartCommsTask */
/**
* @brief Function implementing the commsTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartCommsTask */
void StartCommsTask(void const * argument)
{
  /* USER CODE BEGIN StartCommsTask */
  CommsTask_Run(argument);

  /* Если сюда дошли — это ошибка: CommsTask_Run должен быть вечным */
  configASSERT(0);
  /* USER CODE END StartCommsTask */
}

/* USER CODE BEGIN Header_StartDoorsTask */
/**
  * @brief  Function implementing the doorsTask thread.
  * @param  argument: Not used
  * @retval None
  */
/* USER CODE END Header_StartDoorsTask */
void StartDoorsTask(void const * argument)
{
  /* USER CODE BEGIN StartDoorsTask */
  DoorsTask_Run(argument);

  /* Если сюда дошли — это ошибка: DoorsTask_Run должен быть вечным */
  configASSERT(0);
  /* USER CODE END StartDoorsTask */
}


/* USER CODE BEGIN Header_StartSupervisorTask */
/**
* @brief Function implementing the supervisorTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartSupervisorTask */
void StartSupervisorTask(void const * argument)
{
  /* USER CODE BEGIN StartSupervisorTask */
  SupervisorTask_Run(argument);

  /* Если сюда дошли — это ошибка: SupervisorTask_Run должен быть вечным */
  configASSERT(0);
  /* USER CODE END StartSupervisorTask */
}


/* Private application code --------------------------------------------------*/
/* USER CODE BEGIN Application */

/* USER CODE END Application */
