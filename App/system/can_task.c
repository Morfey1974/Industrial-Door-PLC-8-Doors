#include "can_task.h"

#include <string.h>
#include <stdio.h>

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
#include "system/config_service.h" /* For g_project_cfg */

/* FDCAN handle from CubeMX */
extern FDCAN_HandleTypeDef hfdcan1;

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
                    printf("CAN_SLAVE: received openTimeoutMs=%lu ms from MASTER\r\n", (unsigned long)openTimeoutMs);
                    /* Функция DoorsCfg_SetOpenTimeoutMs всегда доступна (не weak) */
                    DoorsCfg_SetOpenTimeoutMs(openTimeoutMs);
                }
                else
                {
                    printf("CAN_SLAVE: received invalid openTimeoutMs=%lu ms, ignored\r\n", (unsigned long)openTimeoutMs);
                }
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
                /* ЛОГИРОВАНИЕ: получение команды UNLOCK от MASTER */
                printf("CAN_SLAVE: Door%u UNLOCK cmd, stateOk=%u locked=%u closed=%u alarming=%u\r\n",
                       (unsigned)localDoor, (unsigned)doorStateOk,
                       doorStateOk ? (unsigned)doorState.locked : 999U,
                       doorStateOk ? (unsigned)doorState.physClosed : 999U,
                       doorStateOk ? (unsigned)doorState.alarming : 999U);
                
                /* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: не вызываем Doors_RequestLock для UNLOCK,
                 * если дверь уже разблокирована. Это предотвращает установку pending
                 * и ненужные переключения.
                 */
                if (doorStateOk && (doorState.locked == 0U))
                {
                    /* Дверь уже разблокирована - не отправляем команду, чтобы избежать дергания */
                    printf("CAN_SLAVE: Door%u UNLOCK IGNORED (already unlocked)\r\n", (unsigned)localDoor);
                    continue;
                }
                
                /* Дверь заблокирована - отправляем команду UNLOCK.
                 * Команда будет применена немедленно в updateOneDoor, так как дверь заблокирована.
                 */
                uint8_t result = Doors_RequestLock(localDoor, 0U, (uint32_t)APP_SRC_CAN, 2000U);
                printf("CAN_SLAVE: Door%u UNLOCK RequestLock result=%u\r\n", (unsigned)localDoor, (unsigned)result);
            }
            else if (wantLock)
            {
                /* ЛОГИРОВАНИЕ: получение команды LOCK от MASTER */
                printf("CAN_SLAVE: Door%u LOCK cmd, stateOk=%u locked=%u closed=%u alarming=%u\r\n",
                       (unsigned)localDoor, (unsigned)doorStateOk,
                       doorStateOk ? (unsigned)doorState.locked : 999U,
                       doorStateOk ? (unsigned)doorState.physClosed : 999U,
                       doorStateOk ? (unsigned)doorState.alarming : 999U);
                
                /* Отправляем LOCK только если дверь разблокирована и закрыта.
                 * Если дверь уже заблокирована, игнорируем команду.
                 */
                if (doorStateOk && (doorState.locked != 0U) && doorState.physClosed)
                {
                    /* Дверь уже заблокирована и закрыта - не отправляем команду, чтобы избежать дергания */
                    printf("CAN_SLAVE: Door%u LOCK IGNORED (already locked)\r\n", (unsigned)localDoor);
                    continue;
                }
                /* Увеличиваем TTL команды блокировки, чтобы она не истекала между обновлениями.
                 * CAN команды приходят каждые ~200 мс (CAN_STATUS_PERIOD_MS) или раз в 1000 мс (keepalive),
                 * поэтому TTL должен быть больше этого интервала.
                 */
                uint8_t result = Doors_RequestLock(localDoor, 1U, (uint32_t)APP_SRC_CAN, 2000U);
                printf("CAN_SLAVE: Door%u LOCK RequestLock result=%u\r\n", (unsigned)localDoor, (unsigned)result);
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
    {
        printf("CAN_MASTER: openTimeoutMs=%lu invalid, skip sending\r\n", (unsigned long)openTimeoutMs);
        return;
    }
    
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
            printf("CAN_MASTER: sent openTimeoutMs=%lu ms to SLAVE node%u\r\n", 
                   (unsigned long)openTimeoutMs, (unsigned)nodeId);
        }
    }
    if (sentCount == 0U)
    {
        printf("CAN_MASTER: no online SLAVE nodes, openTimeoutMs not sent\r\n");
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
