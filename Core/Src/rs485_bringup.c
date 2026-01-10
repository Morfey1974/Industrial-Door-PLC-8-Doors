#include "rs485_bringup.h"

#include "cmsis_os.h"        /* CMSIS-RTOS v1 */
#include "usart.h"
#include "bsp_doors_io.h"
#include <stdint.h>
#include <stdbool.h>

/* ============================================================
   ВЫБОР РОЛИ (делаем две прошивки)
   ------------------------------------------------------------
   MASTER: 1
   SLAVE : 0
   ============================================================ */
#define RS485_ROLE_IS_MASTER   1   /* <-- MASTER=1, SLAVE=0 */

/* UART4 в RS-485 режиме уже инициализирован CubeMX через HAL_RS485Ex_Init() */
extern UART_HandleTypeDef huart4;

/* Важно: чтобы SLAVE-красный не "сбивался" doors_task,
   на SLAVE мы приостанавливаем поток doorsTask. */
extern osThreadId doorsTaskHandle;

/* Команды: явное состояние */
#define RS485_CMD_LED_ON   ((uint8_t)'1')
#define RS485_CMD_LED_OFF  ((uint8_t)'0')

#if (RS485_ROLE_IS_MASTER == 1)

/* ---------------- MASTER TASK ----------------
   Логика строго как ты попросил:
     1) отправить '1' (ON) -> SLAVE включает красный и держит
     2) через 1 секунду отправить '0' (OFF) -> SLAVE выключает
   Никаких таймеров/периодов на SLAVE для длительности.
*/
static void RS485_MasterTask(void const *argument)
{
    (void)argument;

    const uint8_t on_cmd  = RS485_CMD_LED_ON;
    const uint8_t off_cmd = RS485_CMD_LED_OFF;

    for (;;)
    {
        (void)HAL_UART_Transmit(&huart4, (uint8_t*)&on_cmd,  1, 100);
        osDelay(1000);

        (void)HAL_UART_Transmit(&huart4, (uint8_t*)&off_cmd, 1, 100);
        osDelay(1000);
    }
}

#else  /* ---------------- SLAVE ---------------- */

/* Установка красного Door1 через BSP (у тебя active-low внутри BSP уже учтён) */
static void Door1_Red_Set(bool on)
{
    if (on)
    {
        BSP_DoorIO_SetLedMode(1, BSP_DOOR_LED_RED);
    }
    else
    {
        /* OFF (или можешь поставить GREEN, но для теста лучше явно OFF) */
        BSP_DoorIO_SetLedMode(1, BSP_DOOR_LED_OFF);
    }
}

/* ---------------- SLAVE TASK ----------------
   Принимает байты и просто выставляет LED.
   Никаких задержек “для импульса” — держит состояние до следующей команды.
*/
static void RS485_SlaveTask(void const *argument)
{
    (void)argument;

    uint8_t rx = 0;

    /* Останавливаем doorsTask, чтобы он не перетирал индикацию Door1 */
    if (doorsTaskHandle != NULL)
    {
        osThreadSuspend(doorsTaskHandle);
    }

    /* На всякий случай — безопасно отключим buzzer/lock на Door1 */
    BSP_DoorIO_SetBuzzer(1, false);
    BSP_DoorIO_SetLocked(1, false);

    /* Стартуем с красного OFF */
    Door1_Red_Set(false);

    for (;;)
    {
        /* Ждём 1 байт. Таймаут небольшой, чтобы задача была “живой”. */
        if (HAL_UART_Receive(&huart4, &rx, 1, 200) == HAL_OK)
        {
            if (rx == RS485_CMD_LED_ON)
            {
                Door1_Red_Set(true);
            }
            else if (rx == RS485_CMD_LED_OFF)
            {
                Door1_Red_Set(false);
            }
            else
            {
                /* неизвестная команда — игнорируем */
            }
        }

        osDelay(1);
    }
}

#endif /* ROLE */

void RS485_BringUp_Start(void)
{
#if (RS485_BRINGUP_ENABLE == 0)
    /* RS-485 bring-up завершён и зафиксирован.
       Никакие задачи не создаём.
       Код остаётся в проекте как диагностический,
       но по умолчанию отключён. */
    return;
#else

#if (RS485_ROLE_IS_MASTER == 1)

    osThreadDef(rs485Master, RS485_MasterTask, osPriorityNormal, 0, 256);
    (void)osThreadCreate(osThread(rs485Master), NULL);

#else

    osThreadDef(rs485Slave, RS485_SlaveTask, osPriorityNormal, 0, 256);
    (void)osThreadCreate(osThread(rs485Slave), NULL);

#endif /* ROLE */

#endif /* RS485_BRINGUP_ENABLE */
}
