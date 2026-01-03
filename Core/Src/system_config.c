#include "system_config.h"

// Глобальная конфигурация узла
SystemConfig_t g_sysCfg;

void SystemConfig_InitDefaults(void)
{
    // По умолчанию считаем, что мы МАСТЕР с 8 дверями в системе = 8 локальных дверей
    g_sysCfg.totalDoors     = 8;
    g_sysCfg.blockId        = 0;              // 0 = мастер
    g_sysCfg.role           = NODE_ROLE_MASTER;
    g_sysCfg.localDoorCount = 8;             // мастер не может иметь <2, тут 8 точно ок

    g_sysCfg.canNodeId      = 0;             // CAN ID мастера
    g_sysCfg.canBitrate     = 500000;        // 500 кбит/с, например
}

// После загрузки totalDoors и blockId из конфигурации (WEB/FLASH)
// вызываем эту функцию, чтобы посчитать localDoorCount
void SystemConfig_RecalcForNode(void)
{
    if (g_sysCfg.totalDoors == 0)
    {
        // На всякий случай: нет дверей – считаем, что их нет и игнорируем
        g_sysCfg.localDoorCount = 0;
        return;
    }

    // Сколько полных блоков по 8 дверей
    uint16_t fullBlocks     = g_sysCfg.totalDoors / 8;
    uint16_t lastBlockDoors = g_sysCfg.totalDoors % 8;

    // Общее количество блоков
    uint16_t blockCount = (lastBlockDoors == 0) ? fullBlocks : (fullBlocks + 1);

    // Безопасность: blockId не должен выходить за пределы
    if (g_sysCfg.blockId >= blockCount)
    {
        // Если что-то не так с конфигом — просто считаем, что дверей нет
        g_sysCfg.localDoorCount = 0;
        return;
    }

    // Для всех блоков, кроме последнего, дверей всегда 8
    if (g_sysCfg.blockId < (blockCount - 1))
    {
        g_sysCfg.localDoorCount = 8;
    }
    else
    {
        // Последний блок:
        g_sysCfg.localDoorCount = (lastBlockDoors == 0) ? 8 : (uint8_t)lastBlockDoors;
    }

    // Теперь применяем твой важный закон:
    // "первый блок мастер не может иметь меньше 2 дверей"
    if (g_sysCfg.role == NODE_ROLE_MASTER && g_sysCfg.localDoorCount < 2)
    {
        g_sysCfg.localDoorCount = 2;
    }

    // Дополнительно: ограничим сверху
    if (g_sysCfg.localDoorCount > 8)
    {
        g_sysCfg.localDoorCount = 8;
    }
}
