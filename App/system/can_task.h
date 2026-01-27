#pragma once

#include <stdint.h>

/* door_bitset_t (ЭТАП 6.5) */
#include "logic/logic_deps.h"

#ifdef __cplusplus
extern "C" {
#endif

/* CAN TASK */
void CanTask_Run(void const *argument);

/* =========================================================
 * ЭТАП 6.5: LogicCore -> CAN-task (MASTER)
 *
 * LogicCore вычисляет глобальную маску lockRequired (1..80).
 * CAN-task на MASTER превращает её в COMMAND кадры по SLAVE узлам.
 *
 * Функция не использует RTOS primitives и может вызываться из LogicCore.
 * ========================================================= */
void CanTask_MasterSetLockRequired(const door_bitset_t *lockRequired);

/* =========================================================
 * Передача параметров конфигурации от MASTER к SLAVE
 *
 * Отправляет openTimeoutMs всем онлайн SLAVE узлам через CAN SERVICE кадр.
 * Вызывается после применения конфигурации на MASTER.
 * ========================================================= */
void CanTask_SendConfigParams(void);

#ifdef __cplusplus
}
#endif
