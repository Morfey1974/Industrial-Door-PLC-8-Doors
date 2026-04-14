/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    freertos.c
  * @brief   RTOS stage-2 skeleton (full plan: tasks + event bus + supervisor + watchdog)
  *
  * ЭТАП 2 по плану:
  * 2.1 FreeRTOS + CMSIS-OS
 * 2.2 Декомпозиция задач (упрощённая одноплатная сборка):
 *   - DOOR TASK
 *   - LOGIC CORE TASK (commsTask)
 *   - ETHERNET/HTTP TASK
 *   - LOGGER
 *   - WATCHDOG/SUPERVISOR TASK
 *   Задач CAN и RS-485 в RTOS нет (одноплатная прошивка, только локальные двери и Ethernet).
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
#include "usart.h"
#include "app_events.h"
#include "app_health.h"
#include "app_log.h"


/* App/doors — относительно Core/Src (см. комментарий в main.c про subdir.mk / -I../App). */
#include "../../App/doors/doors_task.h"

/* App/system */
#include "comms_task.h"
#include "net_task.h"
#include "supervisor_task.h"
#include "http_task.h"
#include "http_server.h"
#include "logger_task.h"
#include "watchdog_task.h"
#include "log/event_journal.h"
#include "stdio.h"
#include <stdint.h>
extern volatile uint32_t g_eth_irq;
extern volatile uint32_t g_eth_rx_cb;
extern volatile uint32_t g_eth_tx_cb;
extern volatile uint32_t g_eth_tcpip_cb_fail;

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
/* Definitions for netTask */
osThreadId_t netTaskHandle;
const osThreadAttr_t netTask_attributes = {
  .name = "netTask",
  .stack_size = 768 * 4,
  /* Выше httpTask: сначала MX_LWIP_Init(), иначе httpTask теоретически может опередить и дергать gnetif до готовности. */
  .priority = (osPriority_t) osPriorityAboveNormal,
};
/* Definitions for commsTask */
osThreadId_t commsTaskHandle;
const osThreadAttr_t commsTask_attributes = {
  .name = "commsTask",
  .stack_size = 512 * 4,
  .priority = (osPriority_t) osPriorityNormal,
};
/* Definitions for doorsTask */
osThreadId_t doorsTaskHandle;
const osThreadAttr_t doorsTask_attributes = {
  .name = "doorsTask",
  .stack_size = 512 * 4,
  .priority = (osPriority_t) osPriorityLow,
};
/* Definitions for supervisorTask */
osThreadId_t supervisorTaskHandle;
const osThreadAttr_t supervisorTask_attributes = {
  .name = "supervisorTask",
  .stack_size = 512 * 4,
  .priority = (osPriority_t) osPriorityNormal,
};
/* Definitions for httpTask */
osThreadId_t httpTaskHandle;
const osThreadAttr_t httpTask_attributes = {
  .name = "httpTask",
  /* stack_size в CMSIS-RTOS v2 — байты. На стеке httpTask буфер GET (HTTP_GET_RESPONSE_MAX, до ~12 КБ)
   * плюс цепочка HttpApi_HandleGet — малый стек даёт переполнение и обрывы TCP. */
  .stack_size = 32u * 1024u,
  .priority = (osPriority_t) osPriorityNormal,
};
/* Definitions for loggerTask */
osThreadId_t loggerTaskHandle;
const osThreadAttr_t loggerTask_attributes = {
  .name = "loggerTask",
  .stack_size = 512 * 4,
  .priority = (osPriority_t) osPriorityNormal,
};
/* Definitions for watchdogTask */
osThreadId_t watchdogTaskHandle;
const osThreadAttr_t watchdogTask_attributes = {
  .name = "watchdogTask",
  .stack_size = 512 * 4,
  .priority = (osPriority_t) osPriorityLow,
};
/* Private function prototypes -----------------------------------------------*/
/* USER CODE BEGIN FunctionPrototypes */
static void TaskShouldNeverReturn(void);
/* USER CODE END FunctionPrototypes */

void StartNetTask(void *argument);
void StartCommsTask(void *argument);
void StartDoorsTask(void *argument);
void StartSupervisorTask(void *argument);
void StartHttpTask(void *argument);
void StartLoggerTask(void *argument);
void StartWatchdogTask(void *argument);
extern void MX_LWIP_Init(void);
void MX_FREERTOS_Init(void); /* (MISRA C 2004 rule 8.1) */

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
  /* Журнал событий на QSPI отключён (без задачи и очереди); инициализируем только QSPI-lock и метаданные для EraseAll. */
  EventJournal_Init();
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
  /* creation of netTask */
  netTaskHandle = osThreadNew(StartNetTask, NULL, &netTask_attributes);

  /* creation of commsTask */
  commsTaskHandle = osThreadNew(StartCommsTask, NULL, &commsTask_attributes);

  /* creation of doorsTask */
  doorsTaskHandle = osThreadNew(StartDoorsTask, NULL, &doorsTask_attributes);

  /* creation of supervisorTask */
  supervisorTaskHandle = osThreadNew(StartSupervisorTask, NULL, &supervisorTask_attributes);

  /* creation of httpTask */
  httpTaskHandle = osThreadNew(StartHttpTask, NULL, &httpTask_attributes);

  /* creation of loggerTask */
  loggerTaskHandle = osThreadNew(StartLoggerTask, NULL, &loggerTask_attributes);

  /* creation of watchdogTask */
  watchdogTaskHandle = osThreadNew(StartWatchdogTask, NULL, &watchdogTask_attributes);

  /* USER CODE BEGIN RTOS_THREADS */
  /* add threads, ... */
  /* USER CODE END RTOS_THREADS */

  /* USER CODE BEGIN RTOS_EVENTS */

  /* USER CODE END RTOS_EVENTS */

}

/* USER CODE BEGIN Header_StartNetTask */
/**
* @brief Function implementing the netTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartNetTask */
void StartNetTask(void *argument)
{
  /* init code for LWIP */
  MX_LWIP_Init();
  /* USER CODE BEGIN StartNetTask */
  /* Если хочешь задержку "до" LWIP init — её нельзя ставить здесь,
     потому что MX_LWIP_Init() находится в автогенерируемом блоке выше. */
  printf("ETH: irq=%lu rxcb=%lu txcb=%lu tcpipcbf=%lu httpsel=%lu httpacc=%lu listen=%u\n",
         g_eth_irq, g_eth_rx_cb, g_eth_tx_cb,
         g_eth_tcpip_cb_fail, g_http_listen_sel_fail, g_http_accept_fail,
         (unsigned)HttpServer_IsReady());

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
void StartCommsTask(void *argument)
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
void StartDoorsTask(void *argument)
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
void StartSupervisorTask(void *argument)
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
void StartHttpTask(void *argument)
{
  /* USER CODE BEGIN StartHttpTask */

  HttpTask_Run(argument);

  configASSERT(0);
  TaskShouldNeverReturn();
  /* USER CODE END StartHttpTask */
}

/* USER CODE BEGIN Header_StartLoggerTask */
/**
* @brief Function implementing the loggerTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartLoggerTask */
void StartLoggerTask(void *argument)
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
void StartWatchdogTask(void *argument)
{
  /* USER CODE BEGIN StartWatchdogTask */
  WatchdogTask_Run(argument);

  configASSERT(0);
  TaskShouldNeverReturn();
  /* USER CODE END StartWatchdogTask */
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

