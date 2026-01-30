#include "logic/logic_core.h"
#include "logic/global_door_id.h"

/* ЭТАП 7: формат активного конфига (таблица зависимостей) */
#include "config/config_format.h"

/* Доступ к локальной “модели двери” (только Master node=1) */
#include "doors/doors_task.h"

/* ЭТАП 5.4/6.5: выдача команд на удалённые двери через CAN-task (MASTER) */
#include "system/can_task.h"

/* Для проверки роли системы (MASTER/SLAVE) */
#include "system/system_node.h"

#include <stdio.h>

/* Активный конфиг (загружается на старте в main.c через ConfigService_InitOnBoot).
 * Используем его как источник зависимостей по Этапу 5.1.
 *
 * Примечание: если project_config_t лежит в другом TU и имя отличается —
 * линковка подскажет. Тогда просто замени extern на твоё актуальное имя.
 */
extern project_config_t g_project_cfg;

/* ============================================================
 * Внутренние helpers
 * ============================================================ */

static void recompute_lock_required(logic_core_t *lc)
{
    /* Пересчитываем lockRequired как OR по deps[src] для всех src с depActive=1
     * ВАЖНО: НЕ добавляем физически открытые двери в lockRequired.
     * Это предотвращает конфликт между командой LOCK от MASTER и Safety Layer на SLAVE,
     * который принудительно разблокирует открытые двери.
     * 
     * Для локальных дверей MASTER это уже обрабатывается в apply_to_master_local_doors,
     * но для удаленных дверей (SLAVE) нужно исключить их здесь, чтобы не отправлять
     * команду LOCK через CAN для открытых дверей.
     */
    DoorBitset_Clear(&lc->lockRequired);

    for (uint8_t src = 1; src <= APP_MAX_DOORS; src++)
    {
        if (lc->depActive[src - 1U])
        {
            const door_bitset_t *targets = LogicDeps_GetTargets(&lc->deps, src);
            if (targets)
            {
                /* Добавляем только закрытые целевые двери */
                for (uint8_t target = 1; target <= APP_MAX_DOORS; target++)
                {
                    if (DoorBitset_Test(targets, target))
                    {
                        /* Добавляем в lockRequired только если дверь НЕ открыта */
                        if (!lc->physOpen[target - 1U])
                        {
                            DoorBitset_Set(&lc->lockRequired, target, 1U);
                        }
                    }
                }
            }
        }
    }

    /* Также блокируем целевые двери, которые ждут разблокировки (post-close delay)
     * НО только если они закрыты. Если дверь открыта, она все равно будет разблокирована
     * Safety Layer, и мы начнем блокировку после её закрытия.
     */
    for (uint8_t target = 1; target <= APP_MAX_DOORS; target++)
    {
        if (lc->targetUnlockPending[target - 1U])
        {
            /* Добавляем в lockRequired только если дверь НЕ открыта */
            if (!lc->physOpen[target - 1U])
            {
                DoorBitset_Set(&lc->lockRequired, target, 1U);
            }
        }
    }

    /* 3) Apply door type: NC doors should be locked by default when closed
     * According to plan section 3.9.2: NC doors should be locked in safe state
     * ВАЖНО: Применяем только для локальных дверей MASTER, чтобы избежать проблем
     * с синхронизацией состояния удаленных дверей на SLAVE.
     * Для удаленных дверей (SLAVE) команды LOCK будут отправляться только если
     * они действительно закрыты (проверка physOpen в send_master_command_to_node).
     */
    extern project_config_t g_project_cfg;
    for (uint8_t door = 1; door <= APP_MAX_DOORS; door++)
    {
        /* Check if door is already in lockRequired */
        if (DoorBitset_Test(&lc->lockRequired, door))
            continue;
        
        /* Check if door is open - NC doors should not be locked if open */
        if (lc->physOpen[door - 1U])
            continue;
        
        /* Find door in configuration to check its type and nodeId */
        for (uint16_t i = 0; i < g_project_cfg.doorCount && i < CFG_MAX_DOORS; i++)
        {
            const cfg_door_t *d = &g_project_cfg.doors[i];
            uint8_t gid = Config_MakeGlobalDoorId(d->nodeId, d->localDoor);
            if (gid == door && d->type == DOOR_TYPE_NC)
            {
                /* Применяем NC логику только для локальных дверей MASTER (nodeId=1)
                 * Для удаленных дверей (SLAVE) не добавляем в lockRequired здесь,
                 * чтобы избежать проблем с синхронизацией состояния.
                 * Команды для SLAVE будут формироваться в send_master_command_to_node
                 * на основе актуального physOpen.
                 */
                if (d->nodeId == 1U)
                {
                    /* NC door on MASTER is closed and not in lockRequired - add it */
                    DoorBitset_Set(&lc->lockRequired, door, 1U);
                }
                break;
            }
        }
    }
}

/* Применить решения на локальные двери Master (nodeId=1, localDoor=1..8)
 *
 * ВАЖНО:
 * - DoorTask уже держит инварианты: “нельзя lock при открытой двери”, “alarm выше всего”.
 * - Мы всё равно стараемся формировать корректную цель:
 *    * если дверь OPEN -> цель unlock (DoorTask всё равно принудит unlock)
 *    * если дверь в сигнализации -> цель unlock (DoorTask отвергнет lock-команды)
 */
static void apply_to_master_local_doors(logic_core_t *lc)
{
    (void)lc;

    for (uint8_t localDoor = 1; localDoor <= APP_DOORS_PER_NODE; localDoor++)
    {
        uint8_t gid = GlobalDoorId_Make(1, localDoor); /* nodeId=1 всегда Master */
        if (!gid) continue;

        /* Нужно ли блокировать эту дверь по зависимостям? */
        uint8_t needLock = DoorBitset_Test(&lc->lockRequired, gid);

        /* Снимок локального состояния для “мягких” правил (alarming/open) */
        AppDoorState_t st;
        uint8_t ok = Doors_GetState(localDoor, &st);
        if (!ok)
            continue;

        /* Если дверь физически OPEN -> блокировать нельзя */
        if (!st.physClosed)
            needLock = 0U;

        /* Если сигнализация активна -> держим unlock (DoorTask имеет приоритет) */
        if (st.alarming)
            needLock = 0U;

        /* Выдаём команду модели двери.
         * source: можно использовать APP_SRC_SUPERVISOR как “внутренняя логика”.
         * ttl: 0 (команда актуальна до следующего пересчёта)
         */
        (void)Doors_RequestLock(localDoor, needLock ? 1U : 0U, (uint32_t)APP_SRC_SUPERVISOR, 0U);
    }
}

/* ============================================================
 * Public API
 * ============================================================ */

void LogicCore_Init(logic_core_t *lc)
{
    if (!lc) return;

    LogicDeps_Init(&lc->deps);

    for (uint8_t i = 0; i < APP_MAX_DOORS; i++)
    {
        lc->physOpen[i]    = 0U;
        lc->depActive[i]   = 0U;
        lc->closePending[i]= 0U;
        lc->targetUnlockPending[i] = 0U;
        lc->targetUnlockStartMs[i] = 0U;
    }

    DoorBitset_Clear(&lc->lockRequired);

    /* ------------------------------------------------------------
     * ЭТАП 5.1: модель зависимостей (globalDoorId 1..80)
     *
     * Источник: активный project_config_t, загруженный на старте (Этап 7.2/7.3).
     * Если конфиг ещё не задан или edgeCount=0 — зависимости отсутствуют.
     */
    if (g_project_cfg.formatVersion == CFG_FORMAT_VERSION)
    {
        uint16_t n = g_project_cfg.edgeCount;
        if (n > CFG_MAX_EDGES) n = CFG_MAX_EDGES;

        for (uint16_t i = 0; i < n; i++)
        {
            const cfg_edge_t *e = &g_project_cfg.edges[i];
            uint8_t src = e->srcGlobalDoorId;
            uint8_t dst = e->dstGlobalDoorId;

            /* Минимальная защита от мусора в конфиге */
            if (src < 1U || src > CFG_MAX_DOORS) continue;
            if (dst < 1U || dst > CFG_MAX_DOORS) continue;
            if (src == dst) continue;

            (void)LogicDeps_AddEdge(&lc->deps, src, dst);
        }
    }
}

/* Проверить таймауты целевых дверей и разблокировать те, у которых таймаут истек */
static void check_target_unlock_timeouts(logic_core_t *lc)
{
    extern uint32_t HAL_GetTick(void);
    uint32_t now = HAL_GetTick();
    uint8_t anyChanged = 0U;

    for (uint8_t target = 1; target <= APP_MAX_DOORS; target++)
    {
        if (lc->targetUnlockPending[target - 1U])
        {
            /* Получаем post-close таймаут для целевой двери по globalDoorId */
            /* Используем g_project_cfg.postCloseTimeoutMs[globalDoorId - 1] для всех дверей */
            uint32_t timeout = 0U;
            if (target >= 1U && target <= CFG_MAX_DOORS)
            {
                timeout = g_project_cfg.postCloseTimeoutMs[target - 1U];
            }
            
            if (timeout == 0U)
            {
                /* Таймаут = 0, разблокируем сразу */
                lc->targetUnlockPending[target - 1U] = 0U;
                lc->targetUnlockStartMs[target - 1U] = 0U;
                anyChanged = 1U;
            }
            else
            {
                /* Проверяем, что таймаут был инициализирован */
                if (lc->targetUnlockStartMs[target - 1U] == 0U)
                {
                    /* Таймаут не был инициализирован - разблокируем сразу */
                    lc->targetUnlockPending[target - 1U] = 0U;
                    anyChanged = 1U;
                }
                else
                {
                    uint32_t elapsed = now - lc->targetUnlockStartMs[target - 1U];
                    if (elapsed >= timeout)
                    {
                        /* Таймаут истек, разблокируем */
                        lc->targetUnlockPending[target - 1U] = 0U;
                        lc->targetUnlockStartMs[target - 1U] = 0U;
                        anyChanged = 1U;
                    }
                }
            }
        }
    }

    if (anyChanged)
    {
        recompute_lock_required(lc);
        apply_to_master_local_doors(lc);
    }
}

void LogicCore_RecomputeAndApply(logic_core_t *lc)
{
    if (!lc) return;

    /* Сначала проверяем таймауты целевых дверей */
    check_target_unlock_timeouts(lc);

    recompute_lock_required(lc);

    /* ЭТАП 5.4: выдача команд
     * Сейчас — только локальные двери Master (nodeId=1).
     * Удалённые двери будут раздаваться по CAN на этапе 6.
     * 
     * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: apply_to_master_local_doors должна вызываться
     * ТОЛЬКО на MASTER, а не на SLAVE. На SLAVE все команды должны приходить
     * от MASTER через CAN, а не от локальной логики. Это предотвращает конфликт
     * между локальными командами LOCK на SLAVE и командами UNLOCK от MASTER.
     */
    if (System_GetRole() == APP_ROLE_MASTER)
    {
        apply_to_master_local_doors(lc);
    }

    /* ============================================================
     * ЭТАП 5.4: локальные и удалённые двери
     *
     * Локальные (nodeId=1) применены напрямую в DoorTask.
     * Удалённые (nodeId!=1) раздаём в CAN-task как "целевую" маску.
     * CAN-task на MASTER формирует COMMAND кадры по узлам.
     * ============================================================ */
    CanTask_MasterSetLockRequired(&lc->lockRequired);
}

void LogicCore_OnCanStatus(logic_core_t *lc, uint8_t nodeId,
                           uint8_t presentMask,
                           uint8_t physClosedMask,
                           uint8_t alarmActiveMask,
                           uint8_t signalingActiveMask,
                           uint8_t lockOutputActiveMask)
{
    (void)alarmActiveMask;
    (void)signalingActiveMask;
    (void)lockOutputActiveMask;

    if (!lc) return;
    if (nodeId < 1U || nodeId > APP_MAX_NODES) return;

    /* Обновляем только двери данного узла (1..8) */
    for (uint8_t localDoor = 1; localDoor <= APP_DOORS_PER_NODE; localDoor++)
    {
        uint8_t bit = (uint8_t)(1U << (localDoor - 1U));
        uint8_t present = (presentMask & bit) ? 1U : 0U;

        uint8_t gid = GlobalDoorId_Make(nodeId, localDoor);
        if (!gid) continue;

        if (!present)
        {
            /* Дверь отсутствует/не используется: снимаем эффект */
            lc->physOpen[gid - 1U] = 0U;
            lc->depActive[gid - 1U] = 0U;
            lc->closePending[gid - 1U] = 0U;
            continue;
        }

        uint8_t closed = (physClosedMask & bit) ? 1U : 0U;
        uint8_t open = closed ? 0U : 1U;

        lc->physOpen[gid - 1U] = open;

        /* В Этапе 6 мы синхронизируем базовую физику.
         * Post-close delay для удалённых дверей можно добавить позже,
         * когда у MASTER появится конфиг таймеров на все двери.
         */
        lc->depActive[gid - 1U] = open;
        lc->closePending[gid - 1U] = 0U;
    }

    /* После обновления snapshot пересчитываем зависимость. */
    LogicCore_RecomputeAndApply(lc);
}

void LogicCore_OnEvent(logic_core_t *lc, const app_event_t *evt)
{
    if (!lc || !evt) return;

    /* Сейчас мы обрабатываем только “дверные” события.
     * Позже сюда добавится деградация по CAN / состояние сети (этап 6.7, 2.4.9).
     */
    uint8_t door_id = evt->door_id; /* локальный номер двери на текущей плате */
    if (door_id == 0U)
        return;

    /* globalDoorId по текущей плате (на MASTER 1..8, на SLAVE 9..16 и т.д.), чтобы на SLAVE при открытии ID-2-1 корректно ставился depActive для двери 9 и lockRequired для ID-1-1 в API/маппинге */
    uint8_t nodeId = System_GetNodeId();
    uint8_t gid = GlobalDoorId_Make(nodeId, door_id);
    if (!gid)
        return;

    switch (evt->type)
    {
        case EVT_DOOR_OPEN:
            /* Физика: дверь OPEN */
            lc->physOpen[gid - 1U] = 1U;

            /* 2.4.4: если дверь OPEN — её зависимости должны применяться немедленно */
            lc->depActive[gid - 1U] = 1U;

            /* Если была стадия “close pending”, то повторное OPEN её отменяет */
            lc->closePending[gid - 1U] = 0U;

            /* Если источник снова открывается, сбрасываем таймауты разблокировки целевых дверей */
            const door_bitset_t *targets = LogicDeps_GetTargets(&lc->deps, gid);
            if (targets)
            {
                for (uint8_t target = 1; target <= APP_MAX_DOORS; target++)
                {
                    if (DoorBitset_Test(targets, target))
                    {
                        if (lc->targetUnlockPending[target - 1U])
                        {
                            lc->targetUnlockPending[target - 1U] = 0U;
                            lc->targetUnlockStartMs[target - 1U] = 0U;
                        }
                    }
                }
            }

            LogicCore_RecomputeAndApply(lc);
            break;

        case EVT_DOOR_CLOSE:
            /* Физика: дверь CLOSE */
            lc->physOpen[gid - 1U] = 0U;

            /* ============================================================
             * 2.4.6: post-close delay (задержка реакции логики после закрытия двери)
             *
             * Мы реализуем это через пару событий:
             *   - EVT_DOOR_CLOSE (сейчас)           -> ставим флаг closePending
             *   - EVT_DOOR_POST_CLOSE_READY (позже) -> снимаем эффект зависимостей и пересчитываем
             *
             * ВАЖНЫЙ НЮАНС (исправление поведения после RESET):
             * DoorTask публикует EVT_DOOR_CLOSE сразу после старта (после чтения датчика),
             * но в этот момент дверь НЕ была открыта, и зависимости ещё никогда не активировались.
             *
             * Значит, такое “стартовое CLOSE” НЕ должно:
             *   - включать depActive
             *   - ставить closePending
             *   - и, как следствие, блокировать другие двери на время post-close delay
             *
             * Поэтому closePending ставим ТОЛЬКО если эффект зависимостей реально был активен
             * (depActive==1), то есть дверь ранее была OPEN и успела заблокировать цели.
             * ============================================================ */
            if (lc->depActive[gid - 1U] != 0U)
            {
                /* Источник был открыт и блокировал целевые двери */
                /* Снимаем depActive источника сразу */
                lc->depActive[gid - 1U] = 0U;
                lc->closePending[gid - 1U] = 0U;

                /* Для каждой целевой двери запускаем отсчет её post-close таймаута */
                const door_bitset_t *targets = LogicDeps_GetTargets(&lc->deps, gid);
                if (targets)
                {
                    extern uint32_t HAL_GetTick(void);
                    uint32_t now = HAL_GetTick();
                    
                    for (uint8_t target = 1; target <= APP_MAX_DOORS; target++)
                    {
                        if (DoorBitset_Test(targets, target))
                        {
                            /* Получаем post-close таймаут для целевой двери по globalDoorId
                             * Работает для всех дверей (локальных и удаленных)
                             */
                            uint32_t timeout = 0U;
                            if (target >= 1U && target <= CFG_MAX_DOORS)
                            {
                                timeout = g_project_cfg.postCloseTimeoutMs[target - 1U];
                            }
                            
                            if (timeout > 0U)
                            {
                                /* Запускаем отсчет post-close таймаута для целевой двери */
                                lc->targetUnlockPending[target - 1U] = 1U;
                                lc->targetUnlockStartMs[target - 1U] = now;
                            }
                        }
                    }
                }

                /* Пересчитываем и применяем изменения */
                LogicCore_RecomputeAndApply(lc);
            }
            else
            {
                /* Эффекта не было -> ничего не ждём */
                lc->closePending[gid - 1U] = 0U;
            }
            break;

        case EVT_DOOR_POST_CLOSE_READY:
            /* Это событие теперь не используется для снятия зависимостей источника,
             * так как мы снимаем depActive сразу при EVT_DOOR_CLOSE.
             * Оставляем обработку для совместимости.
             */
            break;

        default:
            /* Остальные события (ALARM, TIMEOUT, SIGNAL_ON/OFF) сейчас не влияют на deps-модель.
             * Приоритет Alarm по ТЗ абсолютный, но в текущей архитектуре DoorTask уже:
             *  - держит unlock
             *  - отвергает lock-команды
             * Поэтому для этапа 5.2–5.4 нам достаточно безопасного поведения без усложнения.
             */
            break;
    }
}

/* ============================================================
 * Manual lock/unlock command API
 * ============================================================ */
uint8_t LogicCore_SubmitManualLockCmd(logic_core_t *lc,
                                     uint8_t localDoorId,
                                     uint8_t lock_on,
                                     uint32_t source,
                                     uint32_t ttl_ms)
{
    if (!lc)
        return 0U;

    /* В текущей версии manual команды поддерживаются только для локальных дверей MASTER (1..8).
     * Для удалённых дверей в ЭТАП 6 команды будут преобразованы в CAN COMMAND.
     */
    if (localDoorId < 1U || localDoorId > APP_DOORS_PER_NODE)
        return 0U;

    /* Команду применяем через DoorTask — там находятся инварианты безопасности:
     *  - запрет блокировки при открытой двери
     *  - приоритет ALARM/сигнализации
     */
    return Doors_RequestLock(localDoorId,
                             lock_on ? 1U : 0U,
                             (uint32_t)source,
                             (uint32_t)ttl_ms);
}
