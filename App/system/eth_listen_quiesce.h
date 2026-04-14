#pragma once

#include <stdint.h>

/*
 * Раньше здесь была синхронизация закрытия listen с перезагрузкой MAC/PHY.
 * Упрощённая схема Ethernet не использует это — оставлены пустые реализации,
 * чтобы не размазывать правки по всему http_server.c (вызовы можно убрать позже).
 */

static inline void EthListen_QuiescePollFromHttpTask(void) { }

static inline uint8_t EthListen_WaitQuiescedBeforeEthReload(uint32_t timeout_ms)
{
    (void)timeout_ms;
    return 1U;
}
