/**
  ******************************************************************************
  * @file    rtc_service.h
  * @brief   Сервис времени: RTC (DS3231) и конвертация в Unix timestamp.
  *          Используется журналом событий и API /api/time.
  ******************************************************************************
  */

#ifndef APP_SYSTEM_RTC_SERVICE_H
#define APP_SYSTEM_RTC_SERVICE_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stdbool.h>

/**
  * Получить текущее время RTC в виде Unix timestamp (секунды с 1970-01-01).
  * @param out_sec  указатель на переменную для результата (секунды)
  * @return true если RTC доступен и чтение успешно, иначе false
  */
bool RTC_GetUnixTime(uint32_t *out_sec);

/**
  * Установить время RTC из Unix timestamp (для синхронизации из UI).
  * @param unix_sec  секунды с 1970-01-01 (UTC или локальное — по соглашению системы)
  * @return true при успешной записи в DS3231
  */
bool RTC_SetFromUnix(uint32_t unix_sec);

#ifdef __cplusplus
}
#endif

#endif /* APP_SYSTEM_RTC_SERVICE_H */
