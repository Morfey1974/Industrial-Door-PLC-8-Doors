#include "app_qspi_lock.h"

static SemaphoreHandle_t s_mtx = NULL;

void AppQspiLock_Init(void)
{
    if (s_mtx) return;
    s_mtx = xSemaphoreCreateMutex();
}

void AppQspiLock_Lock(void)
{
    if (!s_mtx) AppQspiLock_Init();
    (void)xSemaphoreTake(s_mtx, portMAX_DELAY);
}

void AppQspiLock_Unlock(void)
{
    if (!s_mtx) return;
    (void)xSemaphoreGive(s_mtx);
}
