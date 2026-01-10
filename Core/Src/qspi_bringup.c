#include "qspi_bringup.h"

#include "octospi.h"
#include "cmsis_os.h"
#include <stdbool.h>

/* OCTOSPI handle from octospi.c */
extern OSPI_HandleTypeDef hospi1;

/* ---------------- Commands (W25Q family, 1-1-1) ---------------- */
#define CMD_READ_JEDEC_ID     0x9FU
#define CMD_WRITE_ENABLE      0x06U
#define CMD_READ_STATUS1      0x05U
#define CMD_SECTOR_ERASE_4K   0x20U
#define CMD_PAGE_PROGRAM      0x02U
#define CMD_READ_DATA         0x03U

#define SR1_WIP_MASK          0x01U

/* Timeouts (ms) */
#define TMO_CMD_MS            100U
#define TMO_ERASE_MS          5000U
#define TMO_PROGRAM_MS        500U

/* ---------------- Internal helpers ---------------- */

static HAL_StatusTypeDef OSPI_SendCmd_1_1_0(uint8_t instr)
{
    OSPI_RegularCmdTypeDef cmd = {0};

    cmd.OperationType      = HAL_OSPI_OPTYPE_COMMON_CFG;
    cmd.FlashId            = HAL_OSPI_FLASH_ID_1;

    cmd.Instruction        = instr;
    cmd.InstructionMode    = HAL_OSPI_INSTRUCTION_1_LINE;

    cmd.AddressMode        = HAL_OSPI_ADDRESS_NONE;
    cmd.AlternateBytesMode = HAL_OSPI_ALTERNATE_BYTES_NONE;

    cmd.DataMode           = HAL_OSPI_DATA_NONE;
    cmd.DummyCycles        = 0;
    cmd.NbData             = 0;

    return HAL_OSPI_Command(&hospi1, &cmd, TMO_CMD_MS);
}

static HAL_StatusTypeDef OSPI_SendCmd_1_1_1(uint8_t instr, uint32_t addr, uint8_t *buf, uint32_t len, bool is_read)
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

static HAL_StatusTypeDef Flash_WriteEnable(void)
{
    return OSPI_SendCmd_1_1_0(CMD_WRITE_ENABLE);
}

static HAL_StatusTypeDef Flash_ReadSR1(uint8_t *sr1)
{
    /* SR1 read has no address, but HAL requires a command; use "no-addr RX" via 1_1_1 with addr=0 */
    return OSPI_SendCmd_1_1_1(CMD_READ_STATUS1, 0, sr1, 1, true);
}

static HAL_StatusTypeDef Flash_WaitReady(uint32_t timeout_ms)
{
    uint32_t t0 = HAL_GetTick();
    uint8_t sr1 = 0;

    for (;;)
    {
        HAL_StatusTypeDef st = Flash_ReadSR1(&sr1);
        if (st != HAL_OK) return st;

        if ((sr1 & SR1_WIP_MASK) == 0U)
            return HAL_OK;

        if ((HAL_GetTick() - t0) > timeout_ms)
            return HAL_TIMEOUT;

        osDelay(5);
    }
}

/* ---------------- Public API ---------------- */

HAL_StatusTypeDef QSPI_Flash_ReadJEDEC(uint8_t id3[3])
{
    OSPI_RegularCmdTypeDef cmd = {0};

    cmd.OperationType      = HAL_OSPI_OPTYPE_COMMON_CFG;
    cmd.FlashId            = HAL_OSPI_FLASH_ID_1;

    cmd.Instruction        = CMD_READ_JEDEC_ID;
    cmd.InstructionMode    = HAL_OSPI_INSTRUCTION_1_LINE;

    cmd.AddressMode        = HAL_OSPI_ADDRESS_NONE;
    cmd.AlternateBytesMode = HAL_OSPI_ALTERNATE_BYTES_NONE;

    cmd.DataMode           = HAL_OSPI_DATA_1_LINE;
    cmd.NbData             = 3;
    cmd.DummyCycles        = 0;

    HAL_StatusTypeDef st = HAL_OSPI_Command(&hospi1, &cmd, TMO_CMD_MS);
    if (st != HAL_OK) return st;

    return HAL_OSPI_Receive(&hospi1, id3, TMO_CMD_MS);
}

HAL_StatusTypeDef QSPI_Flash_Erase4K(uint32_t addr)
{
    HAL_StatusTypeDef st = Flash_WriteEnable();
    if (st != HAL_OK) return st;

    OSPI_RegularCmdTypeDef cmd = {0};

    cmd.OperationType      = HAL_OSPI_OPTYPE_COMMON_CFG;
    cmd.FlashId            = HAL_OSPI_FLASH_ID_1;

    cmd.Instruction        = CMD_SECTOR_ERASE_4K;
    cmd.InstructionMode    = HAL_OSPI_INSTRUCTION_1_LINE;

    cmd.Address            = addr;
    cmd.AddressMode        = HAL_OSPI_ADDRESS_1_LINE;
    cmd.AddressSize        = HAL_OSPI_ADDRESS_24_BITS;

    cmd.DataMode           = HAL_OSPI_DATA_NONE;
    cmd.NbData             = 0;
    cmd.DummyCycles        = 0;

    st = HAL_OSPI_Command(&hospi1, &cmd, TMO_CMD_MS);
    if (st != HAL_OK) return st;

    return Flash_WaitReady(TMO_ERASE_MS);
}

HAL_StatusTypeDef QSPI_Flash_ProgramPage(uint32_t addr, const uint8_t *data, uint32_t len)
{
    if (data == NULL || len == 0U || len > 256U)
        return HAL_ERROR;

    HAL_StatusTypeDef st = Flash_WriteEnable();
    if (st != HAL_OK) return st;

    /* Program = 0x02 + 24-bit address + data */
    OSPI_RegularCmdTypeDef cmd = {0};

    cmd.OperationType      = HAL_OSPI_OPTYPE_COMMON_CFG;
    cmd.FlashId            = HAL_OSPI_FLASH_ID_1;

    cmd.Instruction        = CMD_PAGE_PROGRAM;
    cmd.InstructionMode    = HAL_OSPI_INSTRUCTION_1_LINE;

    cmd.Address            = addr;
    cmd.AddressMode        = HAL_OSPI_ADDRESS_1_LINE;
    cmd.AddressSize        = HAL_OSPI_ADDRESS_24_BITS;

    cmd.DataMode           = HAL_OSPI_DATA_1_LINE;
    cmd.NbData             = len;
    cmd.DummyCycles        = 0;

    st = HAL_OSPI_Command(&hospi1, &cmd, TMO_CMD_MS);
    if (st != HAL_OK) return st;

    st = HAL_OSPI_Transmit(&hospi1, (uint8_t*)data, TMO_PROGRAM_MS);
    if (st != HAL_OK) return st;

    return Flash_WaitReady(TMO_PROGRAM_MS);
}

HAL_StatusTypeDef QSPI_Flash_Read(uint32_t addr, uint8_t *data, uint32_t len)
{
    if (data == NULL || len == 0U)
        return HAL_ERROR;

    return OSPI_SendCmd_1_1_1(CMD_READ_DATA, addr, data, len, true);
}
