#ifndef INC_DOOR_LOGIC_H_
#define INC_DOOR_LOGIC_H_

#include "doors.h"

#ifdef __cplusplus
extern "C" {
#endif

// Режимы логики (пока используем только один)
#define DOOR_LOGIC_MODE_ONE_OPEN_OTHERS_CLOSED   1

// Инициализация логики (если понадобится что-то на старте)
void DoorLogic_Init(void);

// Применить логику ко всем дверям (логика №1: одна открыта, все остальные закрыты)
void DoorLogic_Apply(void);

#ifdef __cplusplus
}
#endif

#endif /* INC_DOOR_LOGIC_H_ */
