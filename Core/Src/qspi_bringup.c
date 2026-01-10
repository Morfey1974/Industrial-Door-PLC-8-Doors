#include "qspi_bringup.h"

#include "cmsis_os.h"        /* CMSIS-RTOS v1 */
#include "octospi.h"         /* hospi1 */
#include "bsp_doors_io.h"    /* BSP_DoorIO_* */

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#if (QSPI_BRINGUP_ENABLE == 0)

void QSPI_BringUp_Start(void) { return; }

#else

/* OCTOSPI handle из octospi.c */
extern OSPI_HandleTypeDef hospi1;

/* handle задачи doors_task (создаётся в freertos.c) */
extern osThreadId doorsTaskHandle;

/* ---------------- Команды флеша (W25Qxxx) ----------------
   Для надёжности используем 1-1-1 команды.
*/
#define CMD_WRITE_ENABLE      0x06U
#define CMD_READ_STATUS1      0x05U
#define CMD_SECTOR_ERASE_4K   0x20U
#define CMD_PAGE_PROGRAM      0x02U
#define CMD_READ_DATA         0x03U

#define SR1_WIP_MASK          0x01U

/* ---------------- ПАРАМЕТР, КОТОРЫЙ ТЫ МЕНЯЕШЬ ----------------
   Меняешь на 100 / 1000 -> билд -> прошивка.
   Код записывает ЭТО во флеш, читает обратно и мигает Door2 RED
   по значению ИЗ ФЛЕША.
*/
#define BLINK_MS              1000U   /* <-- меняй на 1000U и т.д. */

/* Отдельный 4KB сектор под конфиг (не 0x000000, чтобы не пересекаться с чем-либо) */
#define CONFIG_ADDR           0x001000U

/* Таймауты (мс) */
#define TMO_CMD_MS            200U
#define TMO_ERASE_MS          5000U
#define TMO_PROGRAM_MS        500U

/* Конфиг структура + magic */
#define CFG_MAGIC             0x51424C4BU  /* 'QBLK' */

typedef struct
{
    uint32_t magic;
    uint32_t blink_ms;
} qspi_cfg_t;

static volatile uint32_t g_blink_ms_from_flash = BLINK_MS;

/* ============================================================
   LED helpers (после suspend doors_task конфликтов быть не должно)
   ============================================================ */

static inline void Door2_Red_On(void)  { BSP_DoorIO_SetLedMode(2, BSP_DOOR_LED_RED); }
static inline void Door2_Off(void)     { BSP_DoorIO_SetLedMode(2, BSP_DOOR_LED_OFF); }

/* Если что-то совсем сломалось — будем сигналить Door1 RED быстрым миганием */
static inline void Door1_Red_On(void)  { BSP_DoorIO_SetLedMode(1, BSP_DOOR_LED_RED); }
static inline void Door1_Off(void)     { BSP_DoorIO_SetLedMode(1, BSP_DOOR_LED_OFF); }

static void Fail_Forever(void)
{
    for (;;)
    {
        Door1_Red_On();
        osDelay(100);
        Door1_Off();
        osDelay(100);
    }
}

/* ============================================================
   OSPI helpers
   ============================================================ */

static HAL_StatusTypeDef OSPI_Cmd_NoAddr_Tx(uint8_t instr)
{
    OSPI_RegularCmdTypeDef cmd = {0};

    cmd.OperationType      = HAL_OSPI_OPTYPE_COMMON_CFG;
    cmd.FlashId            = HAL_OSPI_FLASH_ID_1;

    cmd.Instruction        = instr;
    cmd.InstructionMode    = HAL_OSPI_INSTRUCTION_1_LINE;

    cmd.AddressMode        = HAL_OSPI_ADDRESS_NONE;
    cmd.AlternateBytesMode = HAL_OSPI_ALTERNATE_BYTES_NONE;

    cmd.DataMode           = HAL_OSPI_DATA_NONE;
    cmd.NbData             = 0;
    cmd.DummyCycles        = 0;

    return HAL_OSPI_Command(&hospi1, &cmd, TMO_CMD_MS);
}

/* Команда БЕЗ адреса, но с чтением данных (например SR1) */
static HAL_StatusTypeDef OSPI_Cmd_NoAddr_Rx(uint8_t instr, uint8_t *buf, uint32_t len)
{
    OSPI_RegularCmdTypeDef cmd = {0};

    cmd.OperationType      = HAL_OSPI_OPTYPE_COMMON_CFG;
    cmd.FlashId            = HAL_OSPI_FLASH_ID_1;

    cmd.Instruction        = instr;
    cmd.InstructionMode    = HAL_OSPI_INSTRUCTION_1_LINE;

    cmd.AddressMode        = HAL_OSPI_ADDRESS_NONE;
    cmd.AlternateBytesMode = HAL_OSPI_ALTERNATE_BYTES_NONE;

    cmd.DataMode           = HAL_OSPI_DATA_1_LINE;
    cmd.NbData             = len;
    cmd.DummyCycles        = 0;

    HAL_StatusTypeDef st = HAL_OSPI_Command(&hospi1, &cmd, TMO_CMD_MS);
    if (st != HAL_OK) return st;

    return HAL_OSPI_Receive(&hospi1, buf, TMO_CMD_MS);
}

/* Команда с адресом + data TX/RX (1-1-1) */
static HAL_StatusTypeDef OSPI_Cmd_Addr_Data(uint8_t instr, uint32_t addr, uint8_t *buf, uint32_t len, bool is_read)
{
    OSPI_RegularCmdTypeDef cmd = {0};

    cmd.OperationType      = HAL_OSPI_OPTYPE_COMMON_CFG;
    cmd.FlashId            = HAL_OSPI_FLASH_ID_1;

    cmd.Instruction        = instr;
    cmd.InstructionMode    = HAL_OSPI_INSTRUCTION_1_LINE;

    cmd.Address            = addr;
    cmd.AddressMode        = HAL_OSPI_ADDRESS_1_LINE;
    cmd.AddressSize        = HAL_OSPI_ADDRESS_24_BITS;

    cmd.AlternateBytesMode = HAL_OSPI_ALTERNATE_BYTES_NONE;

    cmd.DataMode           = HAL_OSPI_DATA_1_LINE;
    cmd.NbData             = len;

    cmd.DummyCycles        = 0;

    HAL_StatusTypeDef st = HAL_OSPI_Command(&hospi1, &cmd, TMO_CMD_MS);
    if (st != HAL_OK) return st;

    return is_read
        ? HAL_OSPI_Receive(&hospi1, buf, TMO_CMD_MS)
        : HAL_OSPI_Transmit(&hospi1, buf, TMO_PROGRAM_MS);
}

/* ============================================================
   Flash primitives
   ============================================================ */

static HAL_StatusTypeDef Flash_WriteEnable(void)
{
    return OSPI_Cmd_NoAddr_Tx(CMD_WRITE_ENABLE);
}

static HAL_StatusTypeDef Flash_ReadSR1(uint8_t *sr1)
{
    return OSPI_Cmd_NoAddr_Rx(CMD_READ_STATUS1, sr1, 1);
}

static HAL_StatusTypeDef Flash_WaitReady(uint32_t timeout_ms)
{
    uint32_t t0 = HAL_GetTick();
    uint8_t sr1 = 0;

    for (;;)
    {
        HAL_StatusTypeDef st = Flash_ReadSR1(&sr1);
        if (st != HAL_OK) return st;

        if ((sr1 & SR1_WIP_MASK) == 0)
            return HAL_OK;

        if ((HAL_GetTick() - t0) > timeout_ms)
            return HAL_TIMEOUT;

        osDelay(5);
    }
}

static HAL_StatusTypeDef Flash_SectorErase4K(uint32_t addr)
{
    HAL_StatusTypeDef st = Flash_WriteEnable();
    if (st != HAL_OK) return st;

    /* erase 0x20 + 24-bit address, data none */
    OSPI_RegularCmdTypeDef cmd = {0};

    cmd.OperationType      = HAL_OSPI_OPTYPE_COMMON_CFG;
    cmd.FlashId            = HAL_OSPI_FLASH_ID_1;

    cmd.Instruction        = CMD_SECTOR_ERASE_4K;
    cmd.InstructionMode    = HAL_OSPI_INSTRUCTION_1_LINE;

    cmd.Address            = addr;
    cmd.AddressMode        = HAL_OSPI_ADDRESS_1_LINE;
    cmd.AddressSize        = HAL_OSPI_ADDRESS_24_BITS;

    cmd.AlternateBytesMode = HAL_OSPI_ALTERNATE_BYTES_NONE;

    cmd.DataMode           = HAL_OSPI_DATA_NONE;
    cmd.NbData             = 0;
    cmd.DummyCycles        = 0;

    st = HAL_OSPI_Command(&hospi1, &cmd, TMO_CMD_MS);
    if (st != HAL_OK) return st;

    return Flash_WaitReady(TMO_ERASE_MS);
}

static HAL_StatusTypeDef Flash_PageProgram(uint32_t addr, const uint8_t *data, uint32_t len)
{
    if (len > 256U) return HAL_ERROR;

    HAL_StatusTypeDef st = Flash_WriteEnable();
    if (st != HAL_OK) return st;

    st = OSPI_Cmd_Addr_Data(CMD_PAGE_PROGRAM, addr, (uint8_t*)data, len, false);
    if (st != HAL_OK) return st;

    return Flash_WaitReady(TMO_PROGRAM_MS);
}

static HAL_StatusTypeDef Flash_Read(uint32_t addr, uint8_t *data, uint32_t len)
{
    return OSPI_Cmd_Addr_Data(CMD_READ_DATA, addr, data, len, true);
}

/* ============================================================
   1) Записать BLINK_MS в CONFIG_ADDR
   2) Прочитать обратно и проверить
   ============================================================ */

static HAL_StatusTypeDef Flash_WriteThenReadBack_BlinkMs(uint32_t desired_ms)
{
    /* разумные границы */
    if (desired_ms < 50U) desired_ms = 50U;
    if (desired_ms > 5000U) desired_ms = 5000U;

    qspi_cfg_t cfg = {0};
    cfg.magic = CFG_MAGIC;
    cfg.blink_ms = desired_ms;

    HAL_StatusTypeDef st = Flash_SectorErase4K(CONFIG_ADDR);
    if (st != HAL_OK) return st;

    st = Flash_PageProgram(CONFIG_ADDR, (const uint8_t*)&cfg, sizeof(cfg));
    if (st != HAL_OK) return st;

    qspi_cfg_t rb = {0};
    st = Flash_Read(CONFIG_ADDR, (uint8_t*)&rb, sizeof(rb));
    if (st != HAL_OK) return st;

    if (rb.magic != CFG_MAGIC) return HAL_ERROR;
    if (rb.blink_ms != desired_ms) return HAL_ERROR;

    g_blink_ms_from_flash = rb.blink_ms;
    return HAL_OK;
}

/* ============================================================
   Door2 blink task: использует ТОЛЬКО значение из флеша
   ============================================================ */

static void Door2_BlinkTask(void const *argument)
{
    (void)argument;

    for (;;)
    {
        uint32_t p = g_blink_ms_from_flash;
        if (p < 50U) p = 50U;
        if (p > 5000U) p = 5000U;

        Door2_Red_On();
        osDelay(p);
        Door2_Off();
        osDelay(p);
    }
}

/* ============================================================
   Main bring-up task
   ============================================================ */

static void QSPI_BlinkCfg_Task(void const *argument)
{
    (void)argument;

    /* 0) аккуратно отключаем влияние doors_task */
    if (doorsTaskHandle != NULL)
    {
        osThreadSuspend(doorsTaskHandle);
    }

    /* 1) Успокаиваем выходы, чтобы ничего не мешало наблюдать LED */
    for (uint8_t d = 1; d <= 8; d++)
    {
        BSP_DoorIO_SetLocked(d, false);
        BSP_DoorIO_SetBuzzer(d, false);
        BSP_DoorIO_SetLedMode(d, BSP_DOOR_LED_OFF);
    }

    /* 2) Пишем/читаем blink_ms */
    HAL_StatusTypeDef st = Flash_WriteThenReadBack_BlinkMs(BLINK_MS);
    if (st != HAL_OK)
    {
        Fail_Forever();
    }

    /* 3) Мигаем Door2 с периодом из флеша */
    Door2_BlinkTask(NULL);
}

void QSPI_BringUp_Start(void)
{
    osThreadDef(qspiCfg, QSPI_BlinkCfg_Task, osPriorityNormal, 0, 768);
    (void)osThreadCreate(osThread(qspiCfg), NULL);
}

#endif /* QSPI_BRINGUP_ENABLE */
