#pragma once

#include <stdint.h>

/* =========================================================
 * ЭТАП 6.3: формат CAN-сообщений (глобальный план, раздел 5.3)
 *
 * CAN-ID (Standard, 11 бит):
 *   [10..8] MessageType
 *   [7..4]  NodeID (источник)
 *   [3..0]  SubIndex (номер двери/подтип)
 *
 * MessageType:
 *   1 = STATUS  (SLAVE -> MASTER)
 *   2 = COMMAND (MASTER -> SLAVE)
 *   3 = SERVICE (двусторонние: heartbeat/diag)
 * ========================================================= */

typedef enum
{
    CAN_MSG_STATUS  = 1,
    CAN_MSG_COMMAND = 2,
    CAN_MSG_SERVICE = 3
} can_msg_type_t;

typedef enum
{
    CAN_SVC_HEARTBEAT = 1
} can_service_code_t;

/* ---------------- CAN ID helpers ---------------- */

uint32_t CanProto_MakeStdId(can_msg_type_t type, uint8_t node_id, uint8_t sub_index);
void     CanProto_ParseStdId(uint32_t std_id, can_msg_type_t *type, uint8_t *node_id, uint8_t *sub_index);

/* ---------------- Payload formats ---------------- */

/* STATUS frame (8 bytes)
 * Byte0: presentMask
 * Byte1: physClosedMask
 * Byte2: alarmActiveMask
 * Byte3: signalingActiveMask
 * Byte4: lockOutputActiveMask
 * Byte5-6: reserved
 * Byte7: frameCounter (по плану допускается CRC/счётчик; используем счётчик)
 */
typedef struct
{
    uint8_t present;
    uint8_t physClosed;
    uint8_t alarmActive;
    uint8_t signalingActive;
    uint8_t lockOutputActive;
    uint8_t rsvd5;
    uint8_t rsvd6;
    uint8_t counter;
} can_status_payload_t;

/* COMMAND frame (8 bytes)
 * Byte0: doorMask
 * Byte1: lockCommandMask
 * Byte2: unlockCommandMask
 * Byte3: degradedMask
 * Byte4-5: reserved
 * Byte6: sequenceId
 * Byte7: crc8 (poly 0x07 over bytes0..6)
 */
typedef struct
{
    uint8_t doorMask;
    uint8_t lockMask;
    uint8_t unlockMask;
    uint8_t degradedMask;
    uint8_t rsvd4;
    uint8_t rsvd5;
    uint8_t seq;
    uint8_t crc;
} can_cmd_payload_t;

/* SERVICE frame (минимально: heartbeat)
 * Byte0: serviceCode
 * Byte1: role (0=master,1=slave) или 0
 * Byte2: fw_major (опционально)
 * Byte3: fw_minor (опционально)
 * Byte4-7: reserved
 */
typedef struct
{
    uint8_t serviceCode;
    uint8_t role;
    uint8_t fw_major;
    uint8_t fw_minor;
    uint8_t rsvd4;
    uint8_t rsvd5;
    uint8_t rsvd6;
    uint8_t rsvd7;
} can_svc_payload_t;

/* CRC8 helper for COMMAND frames. */
uint8_t CanProto_Crc8(const uint8_t *data, uint8_t len);
