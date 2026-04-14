/**
 * @file app_wall_time.c
 * @brief Реализация заглушки: нет аппаратных часов, чтение/запись Unix-времени не поддерживаются.
 */
#include <stddef.h>

#include "app_wall_time.h"

bool AppWallTime_GetUnix(uint32_t *out_sec)
{
    if (out_sec != NULL)
    {
        *out_sec = 0U;
    }
    return false;
}

bool AppWallTime_SetUnix(uint32_t unix_sec)
{
    (void)unix_sec;
    return false;
}
