#pragma once

#include <stdint.h>
#include <stddef.h>

/* =========================================================
 * ЭТАП 7 (MASTER-only)
 * Формат конфигурации проекта.
 *
 * Важно:
 *  - Конфиг хранится и активируется ТОЛЬКО на MASTER (Node ID = 1).
 *  - Конфиг не участвует в управлении дверьми напрямую и не
 *    обходит Safety Layer. Он задаёт параметры и таблицу зависимостей.
 *
 * Требования из плана:
 *  - open timeout: глобальный (для всех дверей)
 *  - post-close timeout: индивидуальный для каждой двери
 * ========================================================= */

/* Версия формата конфига. При несовпадении версия не активируется. */
#define CFG_FORMAT_VERSION   0x00010001UL

/* Ограничения масштаба */
#define CFG_MAX_NODES        10U
#define CFG_DOORS_PER_NODE   8U
#define CFG_MAX_DOORS        (CFG_MAX_NODES * CFG_DOORS_PER_NODE) /* 80 */

/* Ограничения по строкам */
#define CFG_PROJECT_NAME_LEN 32U
#define CFG_COMMENT_LEN      32U

/* Ограничение по числу рёбер зависимостей.
 * Список рёбер проще валидировать и хранить, чем матрицу 80x80.
 */
#define CFG_MAX_EDGES        256U

/* Лимиты первой версии PUT /api/config/full (вариант A).
 * Явно ограничиваем для простоты отладки и проверок.
 * Увеличено до 16 дверей для поддержки MASTER (8) + SLAVE (8).
 */
#define CFG_FULL_MAX_DOORS_V1        16U
#define CFG_FULL_MAX_EDGES_V1       32U
#define CFG_FULL_MAX_POST_CLOSE_V1   16U

typedef enum
{
    DOOR_TYPE_NC = 0,
    DOOR_TYPE_NO = 1,
    DOOR_TYPE_CARD_READER = 2,
} door_type_t;

/* Описание двери в конфиге */
typedef struct
{
    uint16_t techId;                    /* уникальный идентификатор */
    uint16_t drawingId;                 /* идентификатор на плане */
    uint8_t  nodeId;                    /* 1..10 */
    uint8_t  localDoor;                 /* 1..8 */
    uint8_t  type;                      /* door_type_t */
    uint8_t  reserved0;
    char     comment[CFG_COMMENT_LEN];  /* UTF-8/ASCII, обрезается по 0 */
} cfg_door_t;

/* Ребро зависимости: src открылась => target(ы) блокируются */
typedef struct
{
    uint8_t srcGlobalDoorId;    /* 1..80 */
    uint8_t dstGlobalDoorId;    /* 1..80 */
} cfg_edge_t;

/* Служебные сетевые параметры (не участвуют в блокировке) */
typedef struct
{
    /* Ethernet */
    uint8_t  dhcpEnabled; /* 0/1 */
    uint8_t  ip[4];
    uint8_t  netmask[4];
    uint8_t  gw[4];
    uint16_t webPort;

    /* CAN */
    uint32_t canBitrate;
    uint16_t canOfflineTimeoutMs;
} cfg_net_t;

/* Основной payload конфигурации.
 * Хранится в QSPI как бинарная структура.
 */
typedef struct
{
    uint32_t formatVersion; /* CFG_FORMAT_VERSION */
    uint32_t seq;           /* монотонно увеличивается при каждой активации */

    char projectName[CFG_PROJECT_NAME_LEN];

    /* Тайм-ауты */
    uint32_t openTimeoutMs;                         /* глобальный */
    uint32_t postCloseTimeoutMs[CFG_MAX_DOORS];     /* индивидуальный */

    /* Двери */
    uint8_t doorCount; /* <= 80 */
    uint8_t reserved1[3];
    cfg_door_t doors[CFG_MAX_DOORS];

    /* Зависимости */
    uint16_t edgeCount; /* <= CFG_MAX_EDGES */
    uint16_t reserved2;
    cfg_edge_t edges[CFG_MAX_EDGES];

    /* Сеть (служебно) */
    cfg_net_t net;

    /* Зарезервировано под будущее расширение */
    uint32_t reserved_u32[32];
} project_config_t;

/* Текст ошибки валидации */
typedef struct
{
    char text[96];
} cfg_validate_error_t;

/* Возврат из Config_Validate() */
#define CFG_VALIDATE_OK   (0U)
#define CFG_VALIDATE_BAD  (1U)

/* Сервис */
void Config_Default(project_config_t *cfg);
uint8_t Config_Validate(const project_config_t *cfg, cfg_validate_error_t *err);
void Config_Finalize(project_config_t *cfg);
uint32_t Config_CalcCrc32(const void *data, size_t len);

/* Возвращает globalDoorId (1..80) или 0 при ошибке */
uint8_t Config_MakeGlobalDoorId(uint8_t nodeId, uint8_t localDoor);

