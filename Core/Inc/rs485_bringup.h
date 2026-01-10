#pragma once

/* 0 = код не активен (по умолчанию)
   1 = включить bring-up тест RS-485 */
#define RS485_BRINGUP_ENABLE  0

void RS485_BringUp_Start(void);
