#include "can_task.h"

#include <string.h>

#include "cmsis_os.h"

#include "app_health.h"
#include "app_events.h"

#include "can_bringup.h"
#include "fdcan.h" /* for hfdcan1 + RX polling */

#include "system_node.h"
#include "can_proto.h"

#include "logic/global_door_id.h"
#include "logic/logic_deps.h" /* door_bitset_t */

#include "doors/doors_task.h" /* SLAVE applies commands locally */

#include "comms_task.h" /* MASTER gets LogicCore instance */
#include "logic/logic_core.h"
#include "config/config_format.h" /* For door type and Config_MakeGlobalDoorId */
#include "config/config_layout.h"
#include "system/config_service.h" /* For g_project_cfg */
#include "config/users_format.h"
#include "config/mapping_storage_qspi.h"
#include "log/event_journal.h"
#include "qspi_bringup.h"
#include "system/app_qspi_lock.h"

/* FDCAN handle from CubeMX */
extern FDCAN_HandleTypeDef hfdcan1;
extern project_config_t g_project_cfg;

/* =========================================================
 * Параметры таймингов (можно вынести в конфиг позже)
 * ========================================================= */
#define CAN_HEARTBEAT_PERIOD_MS     500U
#define CAN_STATUS_PERIOD_MS        200U
#define CAN_MASTER_OFFLINE_MS      1500U
#define CAN_SLAVE_CMD_TIMEOUT_MS   1500U

/* MASTER: анти-спам команд (ЭТАП 6.5/6.6)
 * - слать COMMAND только ONLINE узлам
 * - слать COMMAND только при изменении масок
 * - раз в CAN_CMD_KEEPALIVE_MS слать keepalive даже без изменений
 */
#define CAN_CMD_KEEPALIVE_MS       1000U

/* =========================================================
 * MASTER: актуальная целевая маска lockRequired (глобально 1..80)
 * ========================================================= */
static door_bitset_t s_master_lock_required;

void CanTask_MasterSetLockRequired(const door_bitset_t *lockRequired)
{
    if (!lockRequired)
        return;

    /* Копия по значению: тип door_bitset_t небольшой (80 бит). */
    s_master_lock_required = *lockRequired;
}

/* =========================================================
 * MASTER: online tracking SLAVE
 * ========================================================= */
static uint32_t s_last_seen_ms[APP_MAX_NODES + 1]; /* index by nodeId 1..10 */

/* MASTER: последнее отправленное состояние COMMAND по узлам (для анти-спама)
 * Храним только "семантику" (doorMask/lockMask/unlockMask/degradedMask).
 * seq/crc НЕ участвуют в сравнении, иначе changed будет всегда 1.
 */
static uint32_t s_last_cmd_sent_ms[APP_MAX_NODES + 1];
static can_cmd_payload_t s_last_cmd_sent[APP_MAX_NODES + 1];
static uint8_t s_force_cmd_send[APP_MAX_NODES + 1];

/* MASTER: снимок последнего состояния удалённых дверей для генерации edge-событий в журнал.
 * Почему нужно отдельно:
 * - STATUS от SLAVE приходит как текущая маска состояния, без "событий".
 * - Журналу нужны именно переходы (OPEN->CLOSE, SIGNAL ON/OFF), иначе новых записей не будет.
 */
static uint8_t s_remote_seen[APP_MAX_DOORS];
static uint8_t s_last_remote_open[APP_MAX_DOORS];
static uint8_t s_last_remote_signal[APP_MAX_DOORS];

/* Ответы на сервисные команды FLASH (MASTER ждёт ответ синхронно). */
static volatile uint8_t s_flash_scan_resp_ready = 0U;
static volatile uint8_t s_flash_scan_resp_node = 0U;
static volatile uint8_t s_flash_scan_resp_token = 0U;
static volatile uint8_t s_flash_scan_resp_mask = 0U;

static volatile uint8_t s_flash_clear_ack_ready = 0U;
static volatile uint8_t s_flash_clear_ack_node = 0U;
static volatile uint8_t s_flash_clear_ack_token = 0U;
static volatile uint8_t s_flash_clear_ack_ok = 0U;

static uint8_t s_flash_req_token = 1U;

static uint8_t master_is_node_online(uint8_t nodeId);

static void master_mark_seen(uint8_t nodeId)
{
    if (nodeId >= 1U && nodeId <= APP_MAX_NODES)
    {
        /* Фиксируем переход OFFLINE->ONLINE, чтобы сразу отправить актуальную команду */
        uint8_t wasOnline = master_is_node_online(nodeId);
        s_last_seen_ms[nodeId] = HAL_GetTick();
        if (!wasOnline && (nodeId != 1U))
        {
            s_force_cmd_send[nodeId] = 1U;
            s_last_cmd_sent_ms[nodeId] = 0U;
            memset(&s_last_cmd_sent[nodeId], 0, sizeof(s_last_cmd_sent[nodeId]));
        }
    }
}

static uint8_t master_is_node_online(uint8_t nodeId)
{
    uint32_t now = HAL_GetTick();
    if (nodeId < 1U || nodeId > APP_MAX_NODES) return 0U;
    return ((now - s_last_seen_ms[nodeId]) <= CAN_MASTER_OFFLINE_MS) ? 1U : 0U;
}

uint8_t CanTask_MasterIsNodeOnline(uint8_t nodeId)
{
    if (System_GetRole() != APP_ROLE_MASTER) return 0U;
    if (nodeId == 1U) return 1U;
    return master_is_node_online(nodeId);
}

static int qspi_read_local(uint32_t addr, void *dst, uint32_t len)
{
    AppQspiLock_Lock();
    HAL_StatusTypeDef rc = QSPI_Flash_Read(addr, (uint8_t *)dst, len);
    AppQspiLock_Unlock();
    return (rc == HAL_OK) ? 0 : -1;
}

static int qspi_erase_local_4k(uint32_t addr)
{
    AppQspiLock_Lock();
    HAL_StatusTypeDef rc = QSPI_Flash_Erase4K(addr);
    AppQspiLock_Unlock();
    return (rc == HAL_OK) ? 0 : -1;
}

static uint8_t erase_qspi_region_local(uint32_t base, uint32_t size)
{
    if ((size == 0U) || ((size % QSPI_SECTOR_SIZE) != 0U)) return 0U;
    const uint32_t sectors = size / QSPI_SECTOR_SIZE;
    for (uint32_t i = 0U; i < sectors; i++)
    {
        if (qspi_erase_local_4k(base + i * QSPI_SECTOR_SIZE) != 0)
            return 0U;
        if ((i & 0x07U) == 0U) osDelay(1U);
    }
    return 1U;
}

/* Проверка: есть ли валидные данные во flash на текущем узле.
 * Для UI достаточно bool (есть/нет), не нужен полный дамп. */
static uint8_t local_flash_data_mask(void)
{
    uint8_t mask = 0U;

    /* Mapping: magic + len */
    {
        uint8_t hdr[8];
        const uint32_t mapping_magic = 0x4D415050u; /* "MAPP" */
        if (qspi_read_local(QSPI_MAPPING_BASE, hdr, sizeof(hdr)) == 0)
        {
            uint32_t magic = (uint32_t)hdr[0] | ((uint32_t)hdr[1] << 8) |
                             ((uint32_t)hdr[2] << 16) | ((uint32_t)hdr[3] << 24);
            uint32_t len = (uint32_t)hdr[4] | ((uint32_t)hdr[5] << 8) |
                           ((uint32_t)hdr[6] << 16) | ((uint32_t)hdr[7] << 24);
            if (magic == mapping_magic && len > 0U && len <= MAPPING_STORAGE_MAX_LEN)
                mask |= (1U << 1); /* mapping */
        }
    }

    /* Users DB header */
    {
        uint32_t u_hdr[2] = {0U, 0U};
        const uint32_t users_magic = USERS_DB_MAGIC;
        const uint32_t users_fmt = USERS_FORMAT_VERSION;
        if (qspi_read_local(QSPI_USERS_DB_BASE, u_hdr, sizeof(u_hdr)) == 0)
        {
            if (u_hdr[0] == users_magic && u_hdr[1] == users_fmt)
                mask |= (1U << 3); /* users */
        }
    }

    /* Config slot headers A/B magic */
    {
        uint32_t a_magic = 0U, b_magic = 0U;
        const uint32_t cfg_magic = 0x49444346u; /* "IDCF" */
        if (qspi_read_local(QSPI_CFG_SLOT_A_BASE, &a_magic, sizeof(a_magic)) == 0 && a_magic == cfg_magic)
            mask |= (1U << 0); /* config */
        if (qspi_read_local(QSPI_CFG_SLOT_B_BASE, &b_magic, sizeof(b_magic)) == 0 && b_magic == cfg_magic)
            mask |= (1U << 0); /* config */
    }

    /* Journal: есть записи */
    {
        journal_stats_t st;
        memset(&st, 0, sizeof(st));
        EventJournal_GetStats(&st);
        if (st.total_records > 0U)
            mask |= (1U << 2); /* journal */
    }

    return mask;
}

uint8_t CanTask_MasterFlashScanNode(uint8_t nodeId, uint8_t *out_mask)
{
    if (!out_mask) return 0U;
    *out_mask = 0U;
    if (System_GetRole() != APP_ROLE_MASTER) return 0U;
    if (nodeId < 2U || nodeId > APP_MAX_NODES) return 0U;
    if (!master_is_node_online(nodeId)) return 0U;

    can_svc_payload_t svc = {0};
    uint8_t token = s_flash_req_token++;
    if (s_flash_req_token == 0U) s_flash_req_token = 1U;
    svc.serviceCode = (uint8_t)CAN_SVC_FLASH_SCAN_REQ;
    svc.role = (uint8_t)APP_ROLE_MASTER;
    svc.rsvd4 = token;

    s_flash_scan_resp_ready = 0U;
    uint32_t id = CanProto_MakeStdId(CAN_MSG_SERVICE, 1U, nodeId);
    (void)CAN_Link_SendStd(id, (const uint8_t *)&svc, 8U, 0U);

    const uint32_t t0 = HAL_GetTick();
    while ((HAL_GetTick() - t0) < 700U)
    {
        if (s_flash_scan_resp_ready &&
            s_flash_scan_resp_node == nodeId &&
            s_flash_scan_resp_token == token)
        {
            *out_mask = s_flash_scan_resp_mask;
            s_flash_scan_resp_ready = 0U;
            return 1U;
        }
        osDelay(10U);
    }
    return 0U;
}

uint8_t CanTask_MasterFlashClearNode(uint8_t nodeId, uint8_t clear_service_users)
{
    if (System_GetRole() != APP_ROLE_MASTER) return 0U;
    if (nodeId < 2U || nodeId > APP_MAX_NODES) return 0U;

    /* Устойчивый режим очистки:
     * 1) НЕ делаем ранний отказ только по online-флагу (он может кратко "мигать");
     * 2) выполняем несколько попыток отправки запроса;
     * 3) увеличенное окно ожидания ACK, чтобы быть совместимыми со старым SLAVE,
     *    где ACK мог прийти только после длительного erase. */
    enum { FLASH_CLEAR_TRIES = 3U };
    enum { FLASH_CLEAR_ACK_TIMEOUT_MS = 45000U };
    for (uint8_t attempt = 0U; attempt < FLASH_CLEAR_TRIES; attempt++)
    {
        can_svc_payload_t svc = {0};
        uint8_t token = s_flash_req_token++;
        if (s_flash_req_token == 0U) s_flash_req_token = 1U;
        svc.serviceCode = (uint8_t)CAN_SVC_FLASH_CLEAR_REQ;
        svc.role = (uint8_t)APP_ROLE_MASTER;
        svc.rsvd4 = token;
        /* Флаги команды очистки:
         * bit0=1 -> дополнительно стирать служебный users db. */
        svc.rsvd5 = (clear_service_users != 0U) ? 1U : 0U;

        s_flash_clear_ack_ready = 0U;
        uint32_t id = CanProto_MakeStdId(CAN_MSG_SERVICE, 1U, nodeId);
        (void)CAN_Link_SendStd(id, (const uint8_t *)&svc, 8U, 0U);

        const uint32_t t0 = HAL_GetTick();
        while ((HAL_GetTick() - t0) < FLASH_CLEAR_ACK_TIMEOUT_MS)
        {
            if (s_flash_clear_ack_ready &&
                s_flash_clear_ack_node == nodeId &&
                s_flash_clear_ack_token == token)
            {
                uint8_t ok = s_flash_clear_ack_ok ? 1U : 0U;
                s_flash_clear_ack_ready = 0U;
                return ok;
            }
            osDelay(20U);
        }

        /* Небольшая пауза перед повторной отправкой (если предыдущая попытка не дала ACK). */
        osDelay(50U);
    }
    return 0U;
}

/* =========================================================
 * RX dispatch
 * ========================================================= */
static void handle_rx_frame(uint32_t std_id, const uint8_t *data, uint8_t len)
{
    if (len > 8U)
        return;

    can_msg_type_t type;
    uint8_t srcNode;
    uint8_t sub;
    CanProto_ParseStdId(std_id, &type, &srcNode, &sub);

    (void)sub; /* В текущем протоколе subIndex=0, оставлено на будущее */

    const app_role_t role = System_GetRole();
    const uint8_t selfNode = System_GetNodeId();

    /* Любые валидные кадры с nodeId обновляют last_seen на MASTER */
    if (role == APP_ROLE_MASTER)
        master_mark_seen(srcNode);

    if (type == CAN_MSG_SERVICE)
    {
        if (len >= 1U && data[0] == (uint8_t)CAN_SVC_HEARTBEAT)
        {
            /* Heartbeat используется только для диагностики доступности узлов.
             * Подтверждения не требуется.
             */
        }
        else if (len >= 8U && role == APP_ROLE_MASTER && data[0] == (uint8_t)CAN_SVC_FLASH_SCAN_RESP)
        {
            const can_svc_payload_t *svc = (const can_svc_payload_t *)data;
            s_flash_scan_resp_node = srcNode;
            s_flash_scan_resp_token = svc->rsvd4;
            s_flash_scan_resp_mask = svc->rsvd5;
            s_flash_scan_resp_ready = 1U;
        }
        else if (len >= 8U && role == APP_ROLE_MASTER && data[0] == (uint8_t)CAN_SVC_FLASH_CLEAR_ACK)
        {
            const can_svc_payload_t *svc = (const can_svc_payload_t *)data;
            s_flash_clear_ack_node = srcNode;
            s_flash_clear_ack_token = svc->rsvd4;
            s_flash_clear_ack_ok = (svc->rsvd5 != 0U) ? 1U : 0U;
            s_flash_clear_ack_ready = 1U;
        }
        else if (len >= 8U && data[0] == (uint8_t)CAN_SVC_CONFIG_PARAM && role == APP_ROLE_SLAVE)
        {
            /* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: прием параметров конфигурации от MASTER на SLAVE
             * 
             * Проблема: на SLAVE при загрузке используется Config_Default, который
             * устанавливает openTimeoutMs = 30 секунд. Когда конфигурация загружается
             * на MASTER, SLAVE не получает обновленный openTimeoutMs, потому что
             * конфигурация хранится только на MASTER.
             * 
             * Решение: передаем openTimeoutMs через CAN SERVICE кадр от MASTER к SLAVE.
             * Формат: Byte0 = CAN_SVC_CONFIG_PARAM, Byte4-7 = openTimeoutMs (uint32_t, little-endian в rsvd4-rsvd7)
             */
            const can_svc_payload_t *svc = (const can_svc_payload_t *)data;
            if (svc->serviceCode == (uint8_t)CAN_SVC_CONFIG_PARAM && srcNode == 1U)
            {
                /* Извлекаем openTimeoutMs из зарезервированных байтов (rsvd4-rsvd7, little-endian) */
                uint32_t openTimeoutMs = (uint32_t)svc->rsvd4 |
                                        ((uint32_t)svc->rsvd5 << 8U) |
                                        ((uint32_t)svc->rsvd6 << 16U) |
                                        ((uint32_t)svc->rsvd7 << 24U);
                
                if (openTimeoutMs <= 300000U) /* 0 = нет автосигнализации, макс 300 с */
                {
                    DoorsCfg_SetOpenTimeoutMs(openTimeoutMs);
                }
            }
        }
        else if (len >= 8U && role == APP_ROLE_SLAVE &&
                 data[0] == (uint8_t)CAN_SVC_FLASH_SCAN_REQ &&
                 srcNode == 1U && sub == selfNode)
        {
            const can_svc_payload_t *in = (const can_svc_payload_t *)data;
            can_svc_payload_t out = {0};
            out.serviceCode = (uint8_t)CAN_SVC_FLASH_SCAN_RESP;
            out.role = (uint8_t)APP_ROLE_SLAVE;
            out.rsvd4 = in->rsvd4; /* token */
            out.rsvd5 = local_flash_data_mask();
            uint32_t id = CanProto_MakeStdId(CAN_MSG_SERVICE, selfNode, 0U);
            (void)CAN_Link_SendStd(id, (const uint8_t *)&out, 8U, 0U);
        }
        else if (len >= 8U && role == APP_ROLE_SLAVE &&
                 data[0] == (uint8_t)CAN_SVC_FLASH_CLEAR_REQ &&
                 srcNode == 1U && sub == selfNode)
        {
            const can_svc_payload_t *in = (const can_svc_payload_t *)data;
            const uint8_t clear_service_users = (in->rsvd5 & 0x01U) ? 1U : 0U;
            /* ВАЖНО ДЛЯ СТАБИЛЬНОСТИ WebUI НА MASTER:
             * Раньше ACK отправлялся только ПОСЛЕ полной очистки QSPI на SLAVE.
             * Это занимало секунды, и HTTP /flash/clear на MASTER висел в ожидании,
             * блокируя остальные HTTP-запросы (UI видел "пропадание сети").
             *
             * Теперь отправляем ACK сразу (подтверждаем, что команда принята),
             * а длительную очистку выполняем после отправки ACK.
             * Это убирает длительную блокировку HTTP-обработчика на MASTER.
             */
            can_svc_payload_t ack = {0};
            ack.serviceCode = (uint8_t)CAN_SVC_FLASH_CLEAR_ACK;
            ack.role = (uint8_t)APP_ROLE_SLAVE;
            ack.rsvd4 = in->rsvd4; /* token */
            ack.rsvd5 = 1U; /* accepted */
            uint32_t id = CanProto_MakeStdId(CAN_MSG_SERVICE, selfNode, 0U);
            (void)CAN_Link_SendStd(id, (const uint8_t *)&ack, 8U, 0U);

            /* После ACK выполняем фактическую очистку локального flash.
             * Если очистка не удалась, SLAVE просто не уходит в reset.
             * В текущем API этого достаточно: оператор видит быстрый ответ
             * и может перепроверить результат повторным сканированием. */
            uint8_t ok = 1U;
            if (EventJournal_EraseAll() != JOURNAL_OK) ok = 0U;
            if (ok && !erase_qspi_region_local(QSPI_MAPPING_BASE, QSPI_MAPPING_SIZE)) ok = 0U;
            if (ok && clear_service_users && !erase_qspi_region_local(QSPI_USERS_DB_BASE, QSPI_USERS_DB_SIZE)) ok = 0U;
            if (ok && !erase_qspi_region_local(QSPI_CFG_SLOT_A_BASE, QSPI_CFG_SLOT_SIZE)) ok = 0U;
            if (ok && !erase_qspi_region_local(QSPI_CFG_SLOT_B_BASE, QSPI_CFG_SLOT_SIZE)) ok = 0U;
            if (ok)
            {
                Config_Default(&g_project_cfg);
                Config_Finalize(&g_project_cfg);
                ConfigService_ApplyRuntime(&g_project_cfg);
                osDelay(200);
                HAL_NVIC_SystemReset();
            }
        }
        return;
    }

    if (role == APP_ROLE_MASTER)
    {
        if (type == CAN_MSG_STATUS && len == 8U)
        {
            /* STATUS кадр от SLAVE */
            const can_status_payload_t *st = (const can_status_payload_t *)data;

            logic_core_t *lc = CommsTask_GetLogicCore();
            if (lc)
            {
                /* Генерация событий для журнала на MASTER по переходам состояний SLAVE.
                 * Дверной номер пишем как globalDoorId (1..80), чтобы UI мог показать node/local. */
                for (uint8_t localDoor = 1; localDoor <= APP_DOORS_PER_NODE; localDoor++)
                {
                    const uint8_t bit = (uint8_t)(1U << (localDoor - 1U));
                    const uint8_t gid = GlobalDoorId_Make(srcNode, localDoor);
                    if (!gid) continue;
                    const uint8_t idx = (uint8_t)(gid - 1U);

                    const uint8_t present = (st->present & bit) ? 1U : 0U;
                    const uint8_t open = (st->physClosed & bit) ? 0U : 1U;
                    const uint8_t signal_on = (st->signalingActive & bit) ? 1U : 0U;

                    if (!present)
                    {
                        s_remote_seen[idx] = 0U;
                        continue;
                    }

                    if (!s_remote_seen[idx])
                    {
                        /* Первый кадр принимаем как базовый уровень без генерации событий,
                         * чтобы не засорять журнал при старте/переподключении узла. */
                        s_remote_seen[idx] = 1U;
                        s_last_remote_open[idx] = open;
                        s_last_remote_signal[idx] = signal_on;
                    }
                    else
                    {
                        app_event_t evt;
                        memset(&evt, 0, sizeof(evt));
                        evt.source = APP_SRC_CAN;
                        evt.door_id = gid; /* globalDoorId */
                        evt.timestamp = (uint32_t)xTaskGetTickCount();

                        if (open != s_last_remote_open[idx])
                        {
                            evt.type = open ? EVT_DOOR_OPEN : EVT_DOOR_CLOSE;
                            (void)AppEvents_Publish(&evt, 0);
                            s_last_remote_open[idx] = open;
                        }

                        if (signal_on != s_last_remote_signal[idx])
                        {
                            evt.type = signal_on ? EVT_DOOR_SIGNAL_ON : EVT_DOOR_SIGNAL_OFF;
                            evt.arg = signal_on ? 1U : 0U;
                            (void)AppEvents_Publish(&evt, 0);
                            s_last_remote_signal[idx] = signal_on;
                        }
                    }
                }

                LogicCore_OnCanStatus(lc, srcNode,
                                      st->present,
                                      st->physClosed,
                                      st->alarmActive,
                                      st->signalingActive,
                                      st->lockOutputActive);
            }
        }
        return;
    }

    /* SLAVE side */
    if (type == CAN_MSG_COMMAND && len == 8U)
    {
        can_cmd_payload_t cmd;
        memcpy(&cmd, data, sizeof(cmd));

        /* CRC check */
        uint8_t calc = CanProto_Crc8((const uint8_t *)&cmd, 7U);
        if (calc != cmd.crc)
        {
            /* Неверный кадр — игнорируем */
            return;
        }

        /* В этой схеме SLAVE принимает команды только от MASTER (srcNode=1)
         * и только если subIndex==selfNode.
         */
        if (srcNode != 1U || sub != selfNode)
            return;

        /* Применяем к локальным дверям 1..8.
         * Safety Layer в DoorTask всё равно:
         *  - запретит lock при открытой двери
         *  - отвергнет команды при активной сигнализации
         * 
         * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: проверяем текущее состояние двери перед отправкой команды,
         * чтобы не создавать ненужные переключения для уже разблокированных/заблокированных дверей.
         */
        for (uint8_t localDoor = 1; localDoor <= APP_DOORS_PER_NODE; localDoor++)
        {
            uint8_t bit = (uint8_t)(1U << (localDoor - 1U));
            if ((cmd.doorMask & bit) == 0U)
                continue;

            /* Приоритет: если одновременно lock и unlock — unlock выигрывает */
            uint8_t wantUnlock = (cmd.unlockMask & bit) ? 1U : 0U;
            uint8_t wantLock   = (cmd.lockMask   & bit) ? 1U : 0U;

            /* Проверяем текущее состояние двери перед отправкой команды */
            AppDoorState_t doorState;
            uint8_t doorStateOk = Doors_GetState(localDoor, &doorState);
            
            if (wantUnlock)
            {
                /* Не вызываем Doors_RequestLock для UNLOCK, если дверь уже разблокирована */
                if (doorStateOk && (doorState.locked == 0U))
                    continue;
                (void)Doors_RequestLock(localDoor, 0U, (uint32_t)APP_SRC_CAN, 2000U);
            }
            else if (wantLock)
            {
                /* Не отправляем LOCK, если дверь уже заблокирована и закрыта */
                if (doorStateOk && (doorState.locked != 0U) && doorState.physClosed)
                    continue;
                /* TTL 2000 мс — больше интервала CAN команд (~200 мс) */
                (void)Doors_RequestLock(localDoor, 1U, (uint32_t)APP_SRC_CAN, 2000U);
            }
        }

        /* Отдельное состояние degraded можно будет связать с alarmReasons позже.
         * Сейчас degradedMask используется как диагностический флаг.
         */
        (void)cmd.degradedMask;
    }
}

/* =========================================================
 * TX helpers
 * ========================================================= */
static void send_slave_heartbeat(uint8_t nodeId)
{
    can_svc_payload_t hb = {0};
    hb.serviceCode = (uint8_t)CAN_SVC_HEARTBEAT;
    hb.role        = (uint8_t)APP_ROLE_SLAVE;
    uint32_t id = CanProto_MakeStdId(CAN_MSG_SERVICE, nodeId, 0U);
    (void)CAN_Link_SendStd(id, (const uint8_t *)&hb, 8U, 0U);
}

static void send_slave_status(uint8_t nodeId, uint8_t *counter)
{
    can_status_payload_t st;
    memset(&st, 0, sizeof(st));

    /* В текущей аппаратной конфигурации: 8 дверей всегда существуют логически.
     * Если позже появится конфиг (Этап 7/11), presentMask будет формироваться из него.
     */
    st.present = 0xFFU;

    AppDoorState_t *arr = Doors_GetStateArray();
    if (!arr)
        return;

    for (uint8_t i = 0; i < APP_DOORS_PER_NODE; i++)
    {
        uint8_t bit = (uint8_t)(1U << i);
        const AppDoorState_t *d = &arr[i];

        if (d->physClosed)     st.physClosed      |= bit;
        if (d->alarmPressed)   st.alarmActive     |= bit; /* alarmPressed как proxy */
        if (d->alarming)       st.signalingActive |= bit;
        if (d->locked)         st.lockOutputActive|= bit;
    }

    st.counter = (*counter)++;

    uint32_t id = CanProto_MakeStdId(CAN_MSG_STATUS, nodeId, 0U);
    (void)CAN_Link_SendStd(id, (const uint8_t *)&st, 8U, 0U);
}

/* Отправка параметров конфигурации (openTimeoutMs) от MASTER к SLAVE через CAN SERVICE */
void CanTask_SendConfigParams(void)
{
    if (System_GetRole() != APP_ROLE_MASTER)
        return;
    
    extern project_config_t g_project_cfg;
    uint32_t openTimeoutMs = g_project_cfg.openTimeoutMs;
    
    /* Валидация: отправляем только валидные значения */
    if (openTimeoutMs > 300000U) /* 0 = нет автосигнализации, макс 300 с */
        return;
    
    can_svc_payload_t svc = {0};
    svc.serviceCode = (uint8_t)CAN_SVC_CONFIG_PARAM;
    svc.role = (uint8_t)APP_ROLE_MASTER;
    
    /* Упаковываем openTimeoutMs в зарезервированные байты (little-endian) */
    svc.rsvd4 = (uint8_t)(openTimeoutMs & 0xFFU);
    svc.rsvd5 = (uint8_t)((openTimeoutMs >> 8U) & 0xFFU);
    svc.rsvd6 = (uint8_t)((openTimeoutMs >> 16U) & 0xFFU);
    svc.rsvd7 = (uint8_t)((openTimeoutMs >> 24U) & 0xFFU);
    
    /* Отправляем всем онлайн SLAVE узлам */
    uint8_t sentCount = 0U;
    for (uint8_t nodeId = 2; nodeId <= APP_MAX_NODES; nodeId++)
    {
        if (master_is_node_online(nodeId))
        {
            uint32_t id = CanProto_MakeStdId(CAN_MSG_SERVICE, 1U /* MASTER src */, nodeId);
            (void)CAN_Link_SendStd(id, (const uint8_t *)&svc, 8U, 0U);
            sentCount++;
        }
    }
}

static void send_master_command_to_node(uint8_t nodeId, uint8_t *seq)
{
    /* Анти-спам: не шлём COMMAND в offline узлы. */
    if (!master_is_node_online(nodeId))
        return;

    /* Command адресуем логически: кадр несёт команды для дверей данного SLAVE.
     * NodeID в CAN-ID = источник (MASTER=1).
     */

    can_cmd_payload_t cmd;
    memset(&cmd, 0, sizeof(cmd));

    cmd.doorMask = 0xFFU; /* все 8 дверей */

    /* Получаем доступ к LogicCore для проверки physOpen удаленных дверей */
    logic_core_t *lc = CommsTask_GetLogicCore();

    /* Формируем lock/unlock маски по глобальному lockRequired
     * ВАЖНО: Если дверь открыта (physOpen), явно отправляем UNLOCK,
     * даже если она не в lockRequired. Это предотвращает конфликт
     * между командой LOCK от MASTER и Safety Layer на SLAVE,
     * который принудительно разблокирует открытые двери.
     * 
     * ВАЖНО: Не добавляем логику для NC дверей здесь, так как это может
     * создавать постоянное переключение команд. NC двери должны обрабатываться
     * только через lockRequired в recompute_lock_required для локальных дверей MASTER.
     * Для удаленных дверей на SLAVE команды формируются только на основе lockRequired
     * и physOpen, чтобы избежать конфликтов и дергания.
     */
    for (uint8_t localDoor = 1; localDoor <= APP_DOORS_PER_NODE; localDoor++)
    {
        uint8_t gid = GlobalDoorId_Make(nodeId, localDoor);
        if (!gid) continue;

        uint8_t needLock = DoorBitset_Test(&s_master_lock_required, gid) ? 1U : 0U;

        /* Проверяем, открыта ли дверь на SLAVE (по последнему известному состоянию) */
        uint8_t isOpen = 0U;
        if (lc && (gid >= 1U && gid <= APP_MAX_DOORS))
        {
            isOpen = lc->physOpen[gid - 1U];
        }

        uint8_t bit = (uint8_t)(1U << (localDoor - 1U));
        
        /* Если дверь открыта, явно отправляем UNLOCK (приоритет над lockRequired) */
        if (isOpen)
        {
            cmd.unlockMask |= bit;
        }
        else if (needLock)
        {
            cmd.lockMask |= bit;
        }
        else
        {
            /* Дверь закрыта и не в lockRequired - отправляем UNLOCK
             * (не добавляем логику для NC дверей здесь, чтобы избежать дергания)
             */
            cmd.unlockMask |= bit;
        }
    }

    /* Узел online, degraded=0. (Degraded режим ведётся на MASTER по last_seen.) */
    cmd.degradedMask = 0x00U;

    /* Анти-спам: слать только при изменении масок,
     * либо keepalive раз в CAN_CMD_KEEPALIVE_MS.
     */
    uint32_t now = HAL_GetTick();

    can_cmd_payload_t sem = cmd;
    sem.seq = 0U;
    sem.crc = 0U;

    uint8_t changed = (memcmp(&s_last_cmd_sent[nodeId], &sem, sizeof(sem)) != 0) ? 1U : 0U;
    uint8_t due = ((now - s_last_cmd_sent_ms[nodeId]) >= CAN_CMD_KEEPALIVE_MS) ? 1U : 0U;

    if (!changed && !due && (s_force_cmd_send[nodeId] == 0U))
        return;

    cmd.seq = (*seq)++;
    cmd.crc = CanProto_Crc8((const uint8_t *)&cmd, 7U);

    uint32_t id = CanProto_MakeStdId(CAN_MSG_COMMAND, 1U /* MASTER src */, nodeId /* subIndex = dstNode */);
    (void)CAN_Link_SendStd(id, (const uint8_t *)&cmd, 8U, 0U);

    s_last_cmd_sent[nodeId] = sem;
    s_last_cmd_sent_ms[nodeId] = now;
    s_force_cmd_send[nodeId] = 0U;
}

void CanTask_Run(void const *argument)
{
    (void)argument;

    const uint8_t nodeId = System_GetNodeId();
    const app_role_t role = System_GetRole();

    /* Инициализация CAN линка */
    CAN_Link_Init();
    CAN_Link_Start();

    /* Обнуляем служебные структуры (и на MASTER, и на SLAVE — безопасно). */
    for (uint8_t i = 0; i <= APP_MAX_NODES; i++)
    {
        s_last_seen_ms[i] = 0U;
        s_last_cmd_sent_ms[i] = 0U;
        s_force_cmd_send[i] = 0U;
        memset(&s_last_cmd_sent[i], 0, sizeof(s_last_cmd_sent[i]));
    }
    memset(s_remote_seen, 0, sizeof(s_remote_seen));
    memset(s_last_remote_open, 0, sizeof(s_last_remote_open));
    memset(s_last_remote_signal, 0, sizeof(s_last_remote_signal));

    /* MASTER считается online сам по себе */
    if (role == APP_ROLE_MASTER)
        s_last_seen_ms[1U] = HAL_GetTick();

    uint32_t t_hb = HAL_GetTick();
    uint32_t t_status = HAL_GetTick();
    uint32_t t_cmd = HAL_GetTick();
    uint8_t  status_ctr = 0U;
    uint8_t  cmd_seq = 0U;

    for (;;)
    {
        AppHealth_Heartbeat(TASK_CAN);

        /* ------------------------------------------------------------
         * RX: poll FIFO0
         * ------------------------------------------------------------ */
        while (HAL_FDCAN_GetRxFifoFillLevel(&hfdcan1, FDCAN_RX_FIFO0) > 0U)
        {
            FDCAN_RxHeaderTypeDef rx;
            uint8_t data[8];

            if (HAL_FDCAN_GetRxMessage(&hfdcan1, FDCAN_RX_FIFO0, &rx, data) == HAL_OK)
            {
                handle_rx_frame(rx.Identifier, data, 8U);
            }
            else
            {
                break;
            }
        }

        uint32_t now = HAL_GetTick();

        /* ------------------------------------------------------------
         * TX periodic
         * ------------------------------------------------------------ */
        if (role == APP_ROLE_SLAVE)
        {
            if ((now - t_hb) >= CAN_HEARTBEAT_PERIOD_MS)
            {
                t_hb = now;
                send_slave_heartbeat(nodeId);
            }

            if ((now - t_status) >= CAN_STATUS_PERIOD_MS)
            {
                t_status = now;
                send_slave_status(nodeId, &status_ctr);
            }

            /* Degraded режим при потере Master:
             * На этом этапе SLAVE просто продолжает локально безопасно.
             * (Инварианты безопасности в DoorTask не зависят от CAN.)
             */
        }
        else
        {
            /* MASTER: рассылаем команды SLAVE на основе lockRequired */
            if ((now - t_cmd) >= 100U)
            {
                t_cmd = now;
                for (uint8_t n = 2; n <= APP_MAX_NODES; n++)
                {
                    send_master_command_to_node(n, &cmd_seq);
                }
            }
        }

        osDelay(20);
    }
}
