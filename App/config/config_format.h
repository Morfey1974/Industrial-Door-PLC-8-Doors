#pragma once

#include <stdint.h>
#include <stddef.h>

/* =========================================================
 * ЭТАП 7 — формат конфигурации проекта (один контроллер).
 *
 * Важно:
 *  - Конфиг в QSPI на этой плате; nodeId в записях дверей должен совпадать с System_GetNodeId().
 *  - Конфиг не обходит Safety Layer: задаёт параметры и зависимости.
 *
 * Требования из плана:
 *  - open timeout: глобальный (для всех дверей)
 *  - post-close timeout: индивидуальный для каждой двери
 * ========================================================= */

/* Версия формата конфига. При несовпадении версия не активируется. */
#define CFG_FORMAT_VERSION   0x00010002UL
/* Предыдущая версия (drawingId — uint16); читается из QSPI с миграцией в v2. */
#define CFG_FORMAT_VERSION_V1  0x00010001UL

/* Ограничения масштаба */
#define CFG_MAX_NODES        10U
#define CFG_DOORS_PER_NODE   8U
#define CFG_MAX_DOORS        (CFG_MAX_NODES * CFG_DOORS_PER_NODE) /* 80 */

/* Ограничения по строкам */
#define CFG_PROJECT_NAME_LEN 101U  /* до 100 символов + завершающий 0 */
#define CFG_COMMENT_LEN      32U
#define CFG_DRAWING_ID_LEN   32U   /* идентификатор на плане: текст, до 31 символа + 0 */

/* Ограничение по числу рёбер зависимостей.
 * Список рёбер проще валидировать и хранить, чем матрицу 80x80.
 */
#define CFG_MAX_EDGES        256U

/* Лимиты первой версии PUT /api/config/full (вариант A).
 * Поддержка до 40 дверей (например 5 узлов × 8 дверей).
 */
#define CFG_FULL_MAX_DOORS_V1        40U
#define CFG_FULL_MAX_EDGES_V1       64U
#define CFG_FULL_MAX_POST_CLOSE_V1   32U

typedef enum
{
    DOOR_TYPE_NC = 0,
    DOOR_TYPE_NO = 1,
} door_type_t;

/* Описание двери в конфиге */
typedef struct
{
    uint16_t techId;                    /* уникальный идентификатор */
    uint8_t  nodeId;                    /* 1..10 */
    uint8_t  localDoor;                 /* 1..8 */
    uint8_t  type;                      /* door_type_t */
    uint8_t  reserved0;
    char     drawingId[CFG_DRAWING_ID_LEN]; /* идентификатор на плане (текст) */
    char     comment[CFG_COMMENT_LEN];  /* UTF-8/ASCII, обрезается по 0 */
} cfg_door_t;

/* Формат v1 (до CFG_FORMAT_VERSION 0x00010002): drawingId — число uint16. */
typedef struct
{
    uint16_t techId;
    uint16_t drawingId;
    uint8_t  nodeId;
    uint8_t  localDoor;
    uint8_t  type;
    uint8_t  reserved0;
    char     comment[CFG_COMMENT_LEN];
} cfg_door_v1_t;

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

/* Бинарный payload v1 в QSPI (до drawingId-текста). */
typedef struct
{
    uint32_t formatVersion;
    uint32_t seq;
    char projectName[CFG_PROJECT_NAME_LEN];
    uint32_t openTimeoutMs;
    uint32_t postCloseTimeoutMs[CFG_MAX_DOORS];
    uint32_t ncUnlockWindowMs;
    uint32_t ncLockDelayAfterCloseMs;
    uint8_t doorCount;
    uint8_t reserved1[3];
    cfg_door_v1_t doors[CFG_MAX_DOORS];
    uint16_t edgeCount;
    uint16_t reserved2;
    cfg_edge_t edges[CFG_MAX_EDGES];
    cfg_net_t net;
    uint32_t reserved_u32[32];
} project_config_v1_t;

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
    uint32_t ncUnlockWindowMs;                       /* окно разблокировки NC, мс (по умолч. 5000) */
    uint32_t ncLockDelayAfterCloseMs;               /* задержка блокировки NC после закрытия, мс (по умолч. 1000) */

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

    /* Зарезервировано. reserved_u32[0..15] (64 байта) — CORS allowed origin (строка, при пустой — "*"). */
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
/* Миграция бинарного конфига v1 (QSPI) в актуальный project_config_t. */
void Config_MigrateV1ToV2(const project_config_v1_t *src, project_config_t *dst);

/* Возвращает globalDoorId (1..80) или 0 при ошибке */
uint8_t Config_MakeGlobalDoorId(uint8_t nodeId, uint8_t localDoor);

