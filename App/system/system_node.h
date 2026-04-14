#pragma once

#include <stdint.h>

/*
 * Один контроллер в этой прошивке: идентификатор узла в конфиге и формулах globalDoorId — 1.
 * (Поле nodeId у дверей в JSON по-прежнему должно совпадать с этим значением.)
 */
uint8_t System_GetNodeId(void);
