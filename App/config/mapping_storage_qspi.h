#pragma once

#include <stddef.h>
#include <stdint.h>

/* =========================================================
 * Хранение карты маппинга (редактор схем) в QSPI Flash.
 * Один сектор 4 KiB; формат: magic(4) + len(4) + JSON(len).
 * После сброса контроллера карта загружается из QSPI при первом GET.
 * ========================================================= */

#ifdef __cplusplus
extern "C" {
#endif

/* Область карты 8 KiB минус заголовок 8 байт */
#define MAPPING_STORAGE_MAX_LEN  (8U * 1024U - 8U)

/* Загрузить карту из QSPI в RAM. Вызывать при первом GET или при старте. */
void MappingStorage_LoadFromQspi(void);

/* Сохранить текущую карту из RAM в QSPI. Вызывать после PUT. */
int MappingStorage_SaveToQspi(void);

/* Указатель на буфер и длина (только чтение). */
const char *MappingStorage_GetData(void);
size_t MappingStorage_GetLen(void);

/* Записать данные в буфер (копия; len не более MAPPING_STORAGE_MAX_LEN). */
void MappingStorage_SetData(const char *data, size_t len);

#ifdef __cplusplus
}
#endif
