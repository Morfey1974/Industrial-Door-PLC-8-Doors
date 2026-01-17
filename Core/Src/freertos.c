/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    freertos.c
  * @brief   RTOS stage-2 skeleton (full plan: tasks + event bus + supervisor + watchdog)
  *
  * ЭТАП 2 по плану:
  * 2.1 FreeRTOS + CMSIS-OS
  * 2.2 Декомпозиция задач:
  *   - DOOR TASK
  *   - LOGIC CORE TASK
  *   - CAN TASK
  *   - RS-485 TASK
  *   - ETHERNET/HTTP TASK
  *   - LOGGER TASK
  *   - WATCHDOG/SUPERVISOR TASK
  * 2.3 Межзадачное взаимодействие: очередь событий + очередь логов
  * 2.4 Базовый watchdog + контроль зависаний: Health/Heartbeat + Supervisor/Watchdog
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
#include "app_log.h"

/* App/doors */
#include "doors_task.h"

/* App/system */
#include "comms_task.h"
#include "net_task.h"
#include "supervisor_task.h"
#include "can_task.h"
#include "rs485_task.h"
#include "http_task.h"
#include "logger_task.h"
#include "watchdog_task.h"
#include "system/journal_task.h"
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
osThreadId httpTaskHandle;
osThreadId canTaskHandle;
osThreadId rs485TaskHandle;
osThreadId loggerTaskHandle;
osThreadId watchdogTaskHandle;
osThreadId journalTaskHandle;

/* Private function prototypes -----------------------------------------------*/
/* USER CODE BEGIN FunctionPrototypes */
static void TaskShouldNeverReturn(void);
/* USER CODE END FunctionPrototypes */

void StartNetTask(void const * argument);
void StartCommsTask(void const * argument);
void StartDoorsTask(void const * argument);
void StartSupervisorTask(void const * argument);
void StartHttpTask(void const * argument);
void StartCanTask(void const * argument);
void StartRs485Task(void const * argument);
void StartLoggerTask(void const * argument);
void StartWatchdogTask(void const * argument);
void StartJournalTask(void const * argument);

extern void MX_LWIP_Init(void);
void MX_FREERTOS_Init(void); /* (MISRA C 2004 rule 8.1) */

/* GetIdleTaskMemory prototype (linked to static allocation support) */
void vApplicationGetIdleTaskMemory( StaticTask_t **ppxIdleTaskTCBBuffer, StackType_t **ppxIdleTaskStackBuffer, uint32_t *pulIdleTaskStackSize );

/* USER CODE BEGIN GET_IDLE_TASK_MEMORY */
static StaticTask_t xIdleTaskTCBBuffer;
static StackType_t  xIdleStack[configMINIMAL_STACK_SIZE];

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
  AppLog_Init();
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
  /* queues are initialized in AppEvents/AppLog */
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

  /* definition and creation of httpTask */
  osThreadDef(httpTask, StartHttpTask, osPriorityBelowNormal, 0, 512);
  httpTaskHandle = osThreadCreate(osThread(httpTask), NULL);

  /* definition and creation of canTask */
  osThreadDef(canTask, StartCanTask, osPriorityNormal, 0, 512);
  canTaskHandle = osThreadCreate(osThread(canTask), NULL);

  /* definition and creation of rs485Task */
  osThreadDef(rs485Task, StartRs485Task, osPriorityNormal, 0, 512);
  rs485TaskHandle = osThreadCreate(osThread(rs485Task), NULL);

  /* definition and creation of loggerTask */
  osThreadDef(loggerTask, StartLoggerTask, osPriorityBelowNormal, 0, 512);
  loggerTaskHandle = osThreadCreate(osThread(loggerTask), NULL);

  /* definition and creation of watchdogTask */
  osThreadDef(watchdogTask, StartWatchdogTask, osPriorityAboveNormal, 0, 512);
  watchdogTaskHandle = osThreadCreate(osThread(watchdogTask), NULL);

  /* definition and creation of journalTask */
  osThreadDef(journalTask, StartJournalTask, osPriorityBelowNormal, 0, 512);
  journalTaskHandle = osThreadCreate(osThread(journalTask), NULL);

  /* USER CODE BEGIN RTOS_THREADS */
  /* Все задачи по Этапу 2 созданы здесь */
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
  /* Если хочешь задержку "до" LWIP init — её нельзя ставить здесь,
     потому что MX_LWIP_Init() находится в автогенерируемом блоке выше. */
  NetTask_Run(argument);

  configASSERT(0);
  TaskShouldNeverReturn();
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

  configASSERT(0);
  TaskShouldNeverReturn();
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

  configASSERT(0);
  TaskShouldNeverReturn();
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

  configASSERT(0);
  TaskShouldNeverReturn();
  /* USER CODE END StartSupervisorTask */
}

/* USER CODE BEGIN Header_StartHttpTask */
/**
* @brief Function implementing the httpTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartHttpTask */
void StartHttpTask(void const * argument)
{
  /* USER CODE BEGIN StartHttpTask */
  HttpTask_Run(argument);

  configASSERT(0);
  TaskShouldNeverReturn();
  /* USER CODE END StartHttpTask */
}

/* USER CODE BEGIN Header_StartCanTask */
/**
* @brief Function implementing the canTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartCanTask */
void StartCanTask(void const * argument)
{
  /* USER CODE BEGIN StartCanTask */
  CanTask_Run(argument);

  configASSERT(0);
  TaskShouldNeverReturn();
  /* USER CODE END StartCanTask */
}

/* USER CODE BEGIN Header_StartRs485Task */
/**
* @brief Function implementing the rs485Task thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartRs485Task */
void StartRs485Task(void const * argument)
{
  /* USER CODE BEGIN StartRs485Task */
  Rs485Task_Run(argument);

  configASSERT(0);
  TaskShouldNeverReturn();
  /* USER CODE END StartRs485Task */
}

/* USER CODE BEGIN Header_StartLoggerTask */
/**
* @brief Function implementing the loggerTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartLoggerTask */
void StartLoggerTask(void const * argument)
{
  /* USER CODE BEGIN StartLoggerTask */
  LoggerTask_Run(argument);

  configASSERT(0);
  TaskShouldNeverReturn();
  /* USER CODE END StartLoggerTask */
}

/* USER CODE BEGIN Header_StartWatchdogTask */
/**
* @brief Function implementing the watchdogTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartWatchdogTask */
void StartWatchdogTask(void const * argument)
{
  /* USER CODE BEGIN StartWatchdogTask */
  WatchdogTask_Run(argument);

  configASSERT(0);
  TaskShouldNeverReturn();
  /* USER CODE END StartWatchdogTask */
}

/* USER CODE BEGIN Header_StartJournalTask */
/**
* @brief Function implementing the journalTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartJournalTask */
void StartJournalTask(void const * argument)
{
  /* USER CODE BEGIN StartJournalTask */
  /* Infinite loop */
	JournalTask_Run(argument);

	  configASSERT(0);
	  TaskShouldNeverReturn();
  /* USER CODE END StartJournalTask */
}

/* Private application code --------------------------------------------------*/
/* USER CODE BEGIN Application */
/* Эта функция нужна как "предохранитель":
 * все Start*Task() вызывают реальные Run()-функции задач,
 * которые никогда не должны возвращаться.
 * Если вернулись — это фатальная логическая ошибка.
 */
static void TaskShouldNeverReturn(void)
{
  taskDISABLE_INTERRUPTS();
  for (;;)
  {
    /* dead loop */
  }
}
/* USER CODE END Application */
