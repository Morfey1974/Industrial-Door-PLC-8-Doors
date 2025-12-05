#ifndef INC_SYSTEM_CONFIG_H_
#define INC_SYSTEM_CONFIG_H_

#include "main.h"

#ifdef __cplusplus
extern "C" {
#endif

// Роль узла
typedef enum
{
    NODE_ROLE_MASTER = 0,
    NODE_ROLE_SLAVE  = 1
} NodeRole_t;

// Базовая системная конфигурация узла
typedef struct
{
    uint16_t totalDoors;      // Общее количество дверей в системе (всех блоков)
    uint8_t  localDoorCount;  // Количество дверей на ЭТОМ блоке (1..8, но мастер >=2)
    uint8_t  blockId;         // ID блока в системе (0 = мастер, 1..62 = слэйвы)
    NodeRole_t role;          // Роль: мастер или слэйв

    // Закладка под CAN-конфигурацию
    uint8_t  canNodeId;       // CAN ID узла (может совпадать с blockId)
    uint32_t canBitrate;      // Скорость шины, например 250000

    // Закладка под будущие вещи (Ethernet, RS-485, и т.п.)
    // uint32_t ipAddress;
    // uint16_t rs485Address;

} SystemConfig_t;

// Глобальный объект конфигурации
extern SystemConfig_t g_sysCfg;

// Инициализация конфигурации по умолчанию (до загрузки из флеш/WEB)
void SystemConfig_InitDefaults(void);

// Функция, которая будет вызываться после загрузки конфигурации из WEB/FLASH
// и пересчитывать localDoorCount с учётом totalDoors и blockId
void SystemConfig_RecalcForNode(void);

#ifdef __cplusplus
}
#endif

#endif /* INC_SYSTEM_CONFIG_H_ */
