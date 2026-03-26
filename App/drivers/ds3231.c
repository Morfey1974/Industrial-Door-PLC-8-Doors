/**
  ******************************************************************************
  * @file    ds3231.c
  * @brief   Драйвер RTC DS3231 (I2C). Чтение времени и даты.
  ******************************************************************************
  */

#include "ds3231.h"
#include "i2c.h"
#include "usart.h"
#include <string.h>

#define DS3231_TIMEOUT_MS  50u

/* Отладочные маркеры драйвера DS3231 в UART3.
 * По умолчанию выключены, чтобы не забивать последовательный канал в поле.
 * При необходимости диагностики можно временно включить (1U) и получить D0/D1/D2.
 */
#ifndef DS3231_DEBUG_UART
#define DS3231_DEBUG_UART 0U
#endif

#if DS3231_DEBUG_UART
#define DS3231_MARK(id) do { \
  static const char d[] = "RTC: D" id "\r\n"; \
  (void)HAL_UART_Transmit(&huart3, (const uint8_t *)d, (uint16_t)(sizeof(d)-1), 50); \
} while(0)
#else
#define DS3231_MARK(id) do { (void)(id); } while(0)
#endif

static uint8_t bcd_to_dec(uint8_t bcd)
{
  return (uint8_t)((bcd >> 4) * 10 + (bcd & 0x0Fu));
}

/* Преобразование десятичного значения 0–99 в BCD для записи в DS3231 */
static uint8_t dec_to_bcd(uint8_t dec)
{
  return (uint8_t)((dec / 10u) << 4) | (dec % 10u);
}

bool DS3231_ReadDateTime(ds3231_datetime_t *out)
{
  if (out == NULL)
    return false;

  DS3231_MARK("0");  /* вход в ReadDateTime */

  /* При зависшем состоянии I2C — реинициализация перед повторной транзакцией */
  if (hi2c1.State != HAL_I2C_STATE_READY)
    (void)HAL_I2C_Init(&hi2c1);

  uint8_t raw[7];
  const uint32_t addr = DS3231_REG_SEC;
  DS3231_MARK("1");  /* перед HAL_I2C_Mem_Read */
  HAL_StatusTypeDef st = HAL_I2C_Mem_Read(
    &hi2c1,
    DS3231_I2C_ADDR << 1,
    addr,
    I2C_MEMADD_SIZE_8BIT,
    raw,
    sizeof(raw),
    DS3231_TIMEOUT_MS
  );
  DS3231_MARK("2");  /* после HAL_I2C_Mem_Read */

  if (st != HAL_OK)
  {
    memset(out, 0, sizeof(*out));
    return false;
  }

  out->sec   = bcd_to_dec(raw[0] & 0x7Fu);
  out->min   = bcd_to_dec(raw[1]);
  out->hour  = bcd_to_dec(raw[2] & 0x3Fu); /* 24h */
  out->dow   = bcd_to_dec(raw[3]);
  out->date  = bcd_to_dec(raw[4]);
  out->month = bcd_to_dec(raw[5] & 0x1Fu);
  out->year  = bcd_to_dec(raw[6]);

  return true;
}

bool DS3231_WriteDateTime(const ds3231_datetime_t *dt)
{
  if (dt == NULL)
    return false;

  if (hi2c1.State != HAL_I2C_STATE_READY)
    (void)HAL_I2C_Init(&hi2c1);

  uint8_t raw[7];
  raw[0] = dec_to_bcd(dt->sec) & 0x7Fu;   /* секунды, бит 7 = 0 (не стоп) */
  raw[1] = dec_to_bcd(dt->min);
  raw[2] = dec_to_bcd(dt->hour) & 0x3Fu;  /* 24h */
  raw[3] = dec_to_bcd(dt->dow);
  raw[4] = dec_to_bcd(dt->date);
  raw[5] = dec_to_bcd(dt->month) & 0x1Fu;
  raw[6] = dec_to_bcd(dt->year);

  HAL_StatusTypeDef st = HAL_I2C_Mem_Write(
    &hi2c1,
    DS3231_I2C_ADDR << 1,
    DS3231_REG_SEC,
    I2C_MEMADD_SIZE_8BIT,
    raw,
    sizeof(raw),
    DS3231_TIMEOUT_MS
  );
  return (st == HAL_OK);
}

bool DS3231_IsPresent(void)
{
  uint8_t byte;
  HAL_StatusTypeDef st = HAL_I2C_Mem_Read(
    &hi2c1,
    DS3231_I2C_ADDR << 1,
    DS3231_REG_SEC,
    I2C_MEMADD_SIZE_8BIT,
    &byte,
    1,
    DS3231_TIMEOUT_MS
  );
  return (st == HAL_OK);
}
