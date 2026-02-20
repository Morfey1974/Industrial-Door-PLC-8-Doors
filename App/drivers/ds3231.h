/**
  ******************************************************************************
  * @file    ds3231.h
  * @brief   Драйвер RTC DS3231 (I2C). Чтение времени и даты.
  ******************************************************************************
  */

#ifndef APP_DRIVERS_DS3231_H
#define APP_DRIVERS_DS3231_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stdbool.h>

/** I2C адрес DS3231 (7 бит) */
#define DS3231_I2C_ADDR   (0x68u)

/** Регистры времени (BCD) */
#define DS3231_REG_SEC    0x00u
#define DS3231_REG_MIN    0x01u
#define DS3231_REG_HOUR   0x02u
#define DS3231_REG_DOW    0x03u  /* день недели 1-7 */
#define DS3231_REG_DATE   0x04u  /* число 1-31 */
#define DS3231_REG_MONTH  0x05u
#define DS3231_REG_YEAR   0x06u

/** Структура времени/даты из DS3231 (уже в десятичном виде) */
typedef struct {
  uint8_t sec;   /* 0-59 */
  uint8_t min;   /* 0-59 */
  uint8_t hour;  /* 0-23 */
  uint8_t dow;   /* 1-7 (воскресенье=1) */
  uint8_t date;  /* 1-31 */
  uint8_t month; /* 1-12 */
  uint8_t year;  /* 0-99 (год 2000-2099 → year = год - 2000) */
} ds3231_datetime_t;

/**
  * Читает текущие время и дату с DS3231.
  * @param out  указатель на структуру для результата
  * @return true при успехе, false при ошибке I2C
  */
bool DS3231_ReadDateTime(ds3231_datetime_t *out);

/**
  * Записывает время и дату в DS3231 (для синхронизации из UI).
  * @param dt  указатель на структуру с датой/временем в десятичном виде
  * @return true при успехе, false при ошибке I2C
  */
bool DS3231_WriteDateTime(const ds3231_datetime_t *dt);

/**
  * Проверка наличия DS3231 на шине (чтение одного байта).
  * @return true если устройство ответило
  */
bool DS3231_IsPresent(void);

#ifdef __cplusplus
}
#endif

#endif /* APP_DRIVERS_DS3231_H */
