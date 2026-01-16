#pragma once

#include "logic/logic_core.h"

#ifdef __cplusplus
extern "C" {
#endif

void CommsTask_Run(void const *argument);

/* =========================================================
 * ЭТАП 6.4–6.5: CAN-task должен иметь доступ к LogicCore на MASTER,
 * чтобы обновлять глобальный snapshot из STATUS кадров.
 *
 * Getter возвращает адрес статического экземпляра LogicCore,
 * который живёт в comms_task.c.
 * ========================================================= */
logic_core_t* CommsTask_GetLogicCore(void);

#ifdef __cplusplus
}
#endif
