#include "can_proto.h"

#define CAN_ID_TYPE_SHIFT 8U
#define CAN_ID_NODE_SHIFT 4U
#define CAN_ID_TYPE_MASK  0x7U
#define CAN_ID_NODE_MASK  0xFU
#define CAN_ID_SUB_MASK   0xFU

uint32_t CanProto_MakeStdId(can_msg_type_t type, uint8_t node_id, uint8_t sub_index)
{
    uint32_t id = 0U;
    id |= (((uint32_t)type)     & CAN_ID_TYPE_MASK) << CAN_ID_TYPE_SHIFT;
    id |= (((uint32_t)node_id)  & CAN_ID_NODE_MASK) << CAN_ID_NODE_SHIFT;
    id |= (((uint32_t)sub_index)& CAN_ID_SUB_MASK);
    return (id & 0x7FFU);
}

void CanProto_ParseStdId(uint32_t std_id, can_msg_type_t *type, uint8_t *node_id, uint8_t *sub_index)
{
    uint32_t id = std_id & 0x7FFU;

    if (type)
        *type = (can_msg_type_t)((id >> CAN_ID_TYPE_SHIFT) & CAN_ID_TYPE_MASK);
    if (node_id)
        *node_id = (uint8_t)((id >> CAN_ID_NODE_SHIFT) & CAN_ID_NODE_MASK);
    if (sub_index)
        *sub_index = (uint8_t)(id & CAN_ID_SUB_MASK);
}

/* CRC8 (poly 0x07, init 0x00)
 * Достаточно для обнаружения случайных ошибок payload в COMMAND кадрах.
 */
uint8_t CanProto_Crc8(const uint8_t *data, uint8_t len)
{
    uint8_t crc = 0x00U;
    for (uint8_t i = 0; i < len; i++)
    {
        crc ^= data[i];
        for (uint8_t b = 0; b < 8; b++)
        {
            if (crc & 0x80U)
                crc = (uint8_t)((crc << 1U) ^ 0x07U);
            else
                crc = (uint8_t)(crc << 1U);
        }
    }
    return crc;
}
