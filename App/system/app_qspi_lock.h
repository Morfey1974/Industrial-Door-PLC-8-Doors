#pragma once

#include "FreeRTOS.h"
#include "semphr.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Глобальный mutex на доступ к OSPI/QSPI.
 * Важно: один hospi1 используется и конфигом, и журналом.
 */
void AppQspiLock_Init(void);
void AppQspiLock_Lock(void);
void AppQspiLock_Unlock(void);

#ifdef __cplusplus
}
#endif
