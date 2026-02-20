/**
  ******************************************************************************
  * @file    rtc_service.c
  * @brief   Сервис времени: чтение/запись RTC DS3231 и конвертация Unix timestamp.
  ******************************************************************************
  */

#include "rtc_service.h"
#include "drivers/ds3231.h"
#include <string.h>

/* Количество дней в месяце (не високосный год) */
static const uint8_t s_days_in_month[] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };

static int is_leap_year(uint32_t year)
{
    return (year % 4u == 0u && (year % 100u != 0u || year % 400u == 0u)) ? 1 : 0;
}

/* Дней с 1970-01-01 по начало года year (не включая year) */
static uint32_t days_from_epoch_to_year(uint32_t year)
{
    uint32_t d = 0u;
    for (uint32_t y = 1970u; y < year; y++)
        d += (uint32_t)(365 + is_leap_year(y));
    return d;
}

/* Дней с начала года year до начала месяца month (1..12); для февраля учтён високосный год */
static uint32_t days_from_jan1_to_month(uint32_t year, uint32_t month)
{
    uint32_t d = 0u;
    for (uint32_t m = 1u; m < month; m++)
    {
        d += s_days_in_month[m - 1u];
        if (m == 2u)
            d += (uint32_t)is_leap_year(year);
    }
    return d;
}

/* Дата/время DS3231 (год 0–99 = 2000–2099) -> Unix timestamp (секунды с 1970-01-01) */
static uint32_t datetime_to_unix(const ds3231_datetime_t *dt)
{
    uint32_t year_full = 2000u + (uint32_t)dt->year;
    uint32_t days = days_from_epoch_to_year(year_full)
                   + days_from_jan1_to_month(year_full, (uint32_t)dt->month)
                   + (uint32_t)dt->date - 1u;
    return days * 86400u
           + (uint32_t)dt->hour * 3600u
           + (uint32_t)dt->min * 60u
           + (uint32_t)dt->sec;
}

/* Unix timestamp -> дата/время DS3231; день недели 1–7 (воскресенье=1) */
static void unix_to_datetime(uint32_t unix_sec, ds3231_datetime_t *dt)
{
    uint32_t days = unix_sec / 86400u;
    uint32_t sec_in_day = unix_sec % 86400u;

    dt->hour = (uint8_t)(sec_in_day / 3600u);
    dt->min  = (uint8_t)((sec_in_day % 3600u) / 60u);
    dt->sec  = (uint8_t)(sec_in_day % 60u);

    /* День недели: 1970-01-01 — четверг; в DS3231 1=воскресенье, 2=пн, ... 7=суббота */
    uint32_t dow = (days + 4u) % 7u;  /* 0=вс, 1=пн, ... */
    dt->dow = (uint8_t)(dow == 0u ? 7u : dow);

    /* Год: перебираем с 1970 */
    uint32_t y = 1970u;
    uint32_t rem = days;
    for (;;)
    {
        uint32_t days_in_year = (uint32_t)(365 + is_leap_year(y));
        if (rem < days_in_year)
            break;
        rem -= days_in_year;
        y++;
    }
    if (y < 2000u)
        dt->year = 0u;
    else if (y > 2099u)
        dt->year = 99u;
    else
        dt->year = (uint8_t)(y - 2000u);

    /* Месяц и день: rem — день в году (0-based), разбиваем по месяцам */
    uint8_t m = 1;
    for (; m <= 12u; m++)
    {
        uint32_t dim = s_days_in_month[m - 1u] + (uint32_t)(m == 2 ? is_leap_year(y) : 0);
        if (rem < dim)
            break;
        rem -= dim;
    }
    dt->month = m;
    dt->date = (uint8_t)(rem + 1u);
}

bool RTC_GetUnixTime(uint32_t *out_sec)
{
    if (out_sec == NULL)
        return false;

    ds3231_datetime_t dt;
    if (!DS3231_ReadDateTime(&dt))
        return false;

    *out_sec = datetime_to_unix(&dt);
    return true;
}

bool RTC_SetFromUnix(uint32_t unix_sec)
{
    ds3231_datetime_t dt;
    memset(&dt, 0, sizeof(dt));
    unix_to_datetime(unix_sec, &dt);
    return DS3231_WriteDateTime(&dt);
}
