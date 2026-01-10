#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* Запускает:
   - монитор линка (up/down)
   - DHCP-state лог (получили IP/потеряли IP)
   - UDP "alive" сервер (порт 7777)
*/
void LwIP_BringUp_Start(void);

#ifdef __cplusplus
}
#endif
