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

/* Проверка online состояния узла на MASTER (nodeId=1..10). */
uint8_t CanTask_MasterIsNodeOnline(uint8_t nodeId);

/* Синхронный запрос на SLAVE: детальная маска данных в flash.
 * out_mask bits: b0=config, b1=mapping, b2=journal, b3=users. */
uint8_t CanTask_MasterFlashScanNode(uint8_t nodeId, uint8_t *out_mask);

/* Синхронная команда очистки flash на SLAVE.
 * clear_service_users: 0 = только рабочие данные, 1 = включая служебный users db.
 * Возвращает 1 при ACK успеха. */
uint8_t CanTask_MasterFlashClearNode(uint8_t nodeId, uint8_t clear_service_users);

#ifdef __cplusplus
}
#endif
