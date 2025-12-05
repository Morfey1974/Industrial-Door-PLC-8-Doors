#include "door_logic.h"
#include "system_config.h"


// Массив состояний дверей объявлен в doors.c
extern DoorState_t Door[DOOR_COUNT];

// Пока один режим логики — "одна открылась, все остальные закрылись"
//static uint8_t s_logicMode = DOOR_LOGIC_MODE_ONE_OPEN_OTHERS_CLOSED;

void DoorLogic_Init(void)
{
    // Пока ничего не делаем, но место оставляем
}

// Локальный helper: применить Open/Close к нужной двери по индексу
static void DoorLogic_SetDoorOutput(uint8_t id, uint8_t open)
{
    if (open)
    {
        switch (id)
        {
            case 0: Door1_Open(); break;
            case 1: Door2_Open(); break;
            case 2: Door3_Open(); break;
            case 3: Door4_Open(); break;
            case 4: Door5_Open(); break;
            case 5: Door6_Open(); break;
            case 6: Door7_Open(); break;
            case 7: Door8_Open(); break;
            default: break;
        }
    }
    else
    {
        switch (id)
        {
            case 0: Door1_Close(); break;
            case 1: Door2_Close(); break;
            case 2: Door3_Close(); break;
            case 3: Door4_Close(); break;
            case 4: Door5_Close(); break;
            case 5: Door6_Close(); break;
            case 6: Door7_Close(); break;
            case 7: Door8_Close(); break;
            default: break;
        }
    }
}

// Главная функция логики: "одна открылась — все остальные закрылись"
void DoorLogic_Apply(void)
{
    uint8_t count = g_sysCfg.localDoorCount;
    if (count > DOOR_COUNT) count = DOOR_COUNT; // защита

    int8_t openIndex = -1;

    // Ищем первую открытую дверь только среди реально существующих
    for (uint8_t i = 0; i < count; i++)
    {
        if (Door[i].physClosed == 0)
        {
            openIndex = (int8_t)i;
            break;
        }
    }

    // Если ВСЕ физически закрыты -> ВСЕ разблокированы (по твоему правилу)
    if (openIndex == -1)
    {
        for (uint8_t i = 0; i < count; i++)
        {
            DoorLogic_SetDoorOutput(i, 1); // 1 = открыть (разблокировать)
        }
        return;
    }

    // Иначе: одна (openIndex) — open, остальные — close
    for (uint8_t i = 0; i < count; i++)
    {
        uint8_t wantOpen = (i == (uint8_t)openIndex) ? 1 : 0;
        DoorLogic_SetDoorOutput(i, wantOpen);
    }
}
