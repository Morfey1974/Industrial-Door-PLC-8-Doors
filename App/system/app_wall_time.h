/**
 * @file app_wall_time.h
 * @brief Заглушка календарного времени на контроллере.
 *
 * Внешняя RTC (DS3231) и I2C из проекта убраны: на плате нет достоверных «часов стены».
 * Для отображения в Web UI используется время браузера; в HTTP уже передаётся заголовок
 * X-Client-Time — его обрабатывают отдельные места (журнал пользовательских действий).
 * Журнал EVT0 при отсутствии метки от производителя события падает обратно на FreeRTOS tick.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

bool AppWallTime_GetUnix(uint32_t *out_sec);
bool AppWallTime_SetUnix(uint32_t unix_sec);
