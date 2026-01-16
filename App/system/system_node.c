#include "system_node.h"

/*
 * ЭТАП 6.1: NodeID
 * На этом этапе NodeID задаётся compile-time макросом.
 *
 * В CubeIDE можно задать APP_NODE_ID в:
 *  Project Properties -> C/C++ Build -> Settings -> MCU GCC Compiler -> Preprocessor
 *
 * Пример:
 *  APP_NODE_ID=2  (это будет SLAVE nodeId=2)
 */

#ifndef APP_NODE_ID
#define APP_NODE_ID 1
#endif

uint8_t System_GetNodeId(void)
{
    uint8_t id = (uint8_t)APP_NODE_ID;

    /* Жёсткая валидация масштаба из ТЗ: 1..10 */
    if (id < 1U || id > 10U)
        id = 1U;

    return id;
}

app_role_t System_GetRole(void)
{
    return (System_GetNodeId() == 1U) ? APP_ROLE_MASTER : APP_ROLE_SLAVE;
}
