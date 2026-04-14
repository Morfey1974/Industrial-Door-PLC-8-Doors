#include "system_node.h"

/*
 * Фиксированный узел: мультиплатная схема MASTER/SLAVE в прошивке не поддерживается.
 */
uint8_t System_GetNodeId(void)
{
    return 1U;
}
