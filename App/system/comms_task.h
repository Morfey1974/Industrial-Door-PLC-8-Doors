#pragma once

#include "logic/logic_core.h"

#ifdef __cplusplus
extern "C" {
#endif

void CommsTask_Run(void const *argument);

/* Адрес статического LogicCore в comms_task.c (для конфигурации и HTTP). */
logic_core_t* CommsTask_GetLogicCore(void);

#ifdef __cplusplus
}
#endif
