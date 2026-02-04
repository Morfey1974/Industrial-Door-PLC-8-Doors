# HANDOFF: Проблема "дергания" двери на SLAVE

## Критическая проблема

**Симптом:** При открытии двери1 на MASTER дверь1 на SLAVE начинает периодически блокироваться-разблокироваться ("дергается"). При открытии двери1 на SLAVE дверь1 на MASTER работает стабильно (блокируется без проблем).

## Контекст

- **Проект:** Industrial Door PLC (STM32 + React WebUI)
- **Архитектура:** Master/Slave через CAN
- **Конфигурация:** 8 дверей на MASTER (nodeId=1), 8 дверей на SLAVE (nodeId=2)
- **Зависимость:** Дверь1 MASTER → Дверь1 SLAVE (или наоборот)

## Что было сделано

### Попытка 1: Исключение открытых дверей из `lockRequired`

**Файл:** `App/logic/logic_core.c`, функция `recompute_lock_required`

**Изменение:** Добавлена проверка `if (!lc->physOpen[target - 1U])` перед добавлением целевой двери в `lockRequired`. Идея: MASTER не должен отправлять команду LOCK для открытых дверей на SLAVE, чтобы избежать конфликта с Safety Layer.

**Результат:** ❌ Проблема не решена, дверь1 на SLAVE все еще дергается.

### Попытка 2: Предотвращение перезаписи pending команды LOCK на SLAVE

**Файл:** `App/doors/doors_task.c`, функция `Doors_RequestLock`

**Изменение:** Добавлена логика, которая предотвращает перезапись pending команды LOCK, если дверь открыта и приходит новая команда LOCK того же типа. В этом случае только обновляется TTL команды, но сама команда не перезаписывается. Это предотвращает конфликт между командой LOCK от MASTER и Safety Layer на SLAVE, который принудительно разблокирует открытые двери.

**Логика:**
- Если дверь открыта, есть pending LOCK, и приходит новая команда LOCK → не перезаписываем, только обновляем TTL
- UNLOCK команды всегда перезаписывают pending команды (приоритет UNLOCK)
- Для всех остальных случаев команда перезаписывается как обычно

**Результат:** ❌ Проблема не решена полностью - все 8 дверей на SLAVE продолжают дергаться

### Попытка 3: Предотвращение применения UNLOCK для уже разблокированных дверей

**Файл:** `App/doors/doors_task.c`, функции `Doors_RequestLock` и `updateOneDoor`

**Проблема:** MASTER отправляет UNLOCK для всех дверей, которые не в `lockRequired`, даже если они уже разблокированы. Это создает постоянные переключения, так как команда UNLOCK применяется всегда, даже если дверь уже разблокирована.

**Изменения:**

1. **В `Doors_RequestLock`:**
   - Если дверь уже разблокирована и приходит команда UNLOCK:
     - Если есть pending LOCK (дверь была открыта) → отменяем pending LOCK командой UNLOCK
     - Если есть pending UNLOCK → сбрасываем pending, чтобы не обрабатывать команду в updateOneDoor
     - Если нет pending команды → игнорируем UNLOCK для уже разблокированной двери
   - Если дверь уже заблокирована и приходит команда LOCK:
     - Если есть pending UNLOCK → отменяем его командой LOCK
     - Если есть pending LOCK → обновляем только TTL
     - Если нет pending → игнорируем LOCK для уже заблокированной двери

2. **В `updateOneDoor`:**
   - Команда UNLOCK применяется только если дверь заблокирована
   - Если дверь уже разблокирована, команда UNLOCK просто сбрасывает pending без изменения состояния

**Результат:** ❌ Проблема не решена полностью - все 8 дверей на SLAVE продолжают дергаться

### Попытка 4: Проверка состояния двери перед отправкой команды

**Файл:** `App/system/can_task.c`, функция обработки CAN команд на SLAVE

**Проблема:** Даже если команда игнорируется в `Doors_RequestLock`, она все равно может устанавливать pending, что вызывает переключения. Нужно проверять состояние двери перед вызовом `Doors_RequestLock`.

**Изменения:**

1. **В обработчике CAN команд на SLAVE:**
   - Перед вызовом `Doors_RequestLock` проверяем текущее состояние двери через `Doors_GetState`
   - Если дверь уже разблокирована и приходит команда UNLOCK → не вызываем `Doors_RequestLock`
   - Если дверь уже заблокирована и приходит команда LOCK → не вызываем `Doors_RequestLock`
   - Это предотвращает ненужные вызовы и установку pending команд

**Результат:** ✅ Исправление применено, требуется тестирование

## Текущее состояние кода

### `App/logic/logic_core.c`

```c
static void recompute_lock_required(logic_core_t *lc)
{
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

    /* Также блокируем целевые двери, которые ждут разблокировки (post-close delay) */
    for (uint8_t target = 1; target <= APP_MAX_DOORS; target++)
    {
        if (lc->targetUnlockPending[target - 1U])
        {
            if (!lc->physOpen[target - 1U])
            {
                DoorBitset_Set(&lc->lockRequired, target, 1U);
            }
        }
    }
}
```

### `App/system/can_task.c`

**Функция `send_master_command_to_node`:** Формирует CAN команды на основе `s_master_lock_required` (который устанавливается через `CanTask_MasterSetLockRequired`).

**Функция обработки команд на SLAVE:** Принимает CAN команды и вызывает `Doors_RequestLock` с TTL=2000ms.

### `App/doors/doors_task.c`

**Safety Layer:** Принудительно разблокирует открытые двери (строка 677-687):
```c
/* Hard safety invariant: if open -> always unlock (поверх всего) */
if (!closed)
{
    DoorHAL_SetLock(door1based, false);
    s_doors[idx].locked = 0U;
    /* Команда блокировки для открытой двери остается pending */
}
```

## Гипотезы о причине проблемы

1. **Задержка обновления `physOpen`:** MASTER может не сразу узнать, что дверь на SLAVE открыта через CAN STATUS. Период отправки STATUS: `CAN_STATUS_PERIOD_MS = 200ms`.

2. **Keepalive команды:** MASTER отправляет keepalive команды каждые `CAN_CMD_KEEPALIVE_MS = 1000ms`, даже если маска не изменилась. Это может создавать постоянный поток команд LOCK.

3. **TTL команд:** Команды LOCK на SLAVE имеют TTL=2000ms. Если MASTER отправляет команду LOCK, а дверь открыта, команда остается pending. Когда дверь закрывается, команда применяется, но если MASTER продолжает отправлять LOCK (даже для закрытой двери), это может создавать конфликт.

4. **Race condition:** Между моментом, когда дверь на SLAVE открывается, и моментом, когда MASTER получает CAN STATUS и обновляет `physOpen`, MASTER может отправить несколько команд LOCK.

5. **Проблема с `targetUnlockPending`:** Если дверь на SLAVE находится в состоянии `targetUnlockPending` (post-close delay), она добавляется в `lockRequired` даже если открыта (но мы это исправили). Однако может быть проблема с синхронизацией состояния.

## Что нужно проверить

1. **Логи CAN:** Добавить логирование в `send_master_command_to_node` и обработчик команд на SLAVE, чтобы увидеть:
   - Когда MASTER отправляет команду LOCK для двери1 SLAVE
   - Когда SLAVE получает команду LOCK
   - Состояние двери в момент получения команды

2. **Обновление `physOpen`:** Проверить, как быстро обновляется `physOpen[gid-1]` для двери1 SLAVE (gid=9) при открытии/закрытии. Добавить логи в `LogicCore_OnCanStatus`.

3. **Проверка keepalive:** Убедиться, что keepalive не отправляет команды LOCK для открытых дверей. Проверить логику в `send_master_command_to_node` (строки 289-293).

4. **Проверка `depActive`:** Убедиться, что `depActive[0]` (дверь1 MASTER, gid=1) правильно устанавливается в 1 при открытии и сбрасывается при закрытии.

5. **Проверка `targetUnlockPending`:** Убедиться, что для двери1 SLAVE (gid=9) `targetUnlockPending[8]` не устанавливается некорректно.

## Рекомендуемый план действий

1. **Добавить детальное логирование:**
   - В `recompute_lock_required`: логировать, какие двери добавляются в `lockRequired` и почему
   - В `send_master_command_to_node`: логировать отправку команд LOCK/UNLOCK
   - В обработчике команд на SLAVE: логировать получение команд и состояние двери
   - В `LogicCore_OnCanStatus`: логировать обновление `physOpen`

2. **Проверить синхронизацию:**
   - Убедиться, что `physOpen[8]` (дверь1 SLAVE, gid=9) обновляется сразу при получении CAN STATUS
   - Проверить, что `RecomputeAndApply` вызывается сразу после обновления `physOpen`

3. **Альтернативное решение:**
   - Рассмотреть возможность отправки команды UNLOCK для открытых дверей явно, а не просто не отправлять LOCK
   - Или добавить проверку на SLAVE: если дверь открыта и пришла команда LOCK, явно отправить UNLOCK обратно через CAN STATUS (если это поддерживается)

4. **Проверить анти-спам логику:**
   - Убедиться, что `s_last_cmd_sent[nodeId]` правильно обновляется и не создает ложных изменений

## Важные файлы

- `App/logic/logic_core.c` - основная логика зависимостей
- `App/system/can_task.c` - CAN коммуникация
- `App/doors/doors_task.c` - управление дверями и Safety Layer
- `App/logic/logic_core.h` - структура `logic_core_t` с полем `physOpen[APP_MAX_DOORS]`

## Конфигурация системы

- `CAN_STATUS_PERIOD_MS = 200U` - период отправки STATUS от SLAVE
- `CAN_CMD_KEEPALIVE_MS = 1000U` - период keepalive команд от MASTER
- `CAN_SLAVE_CMD_TIMEOUT_MS = 1500U` - таймаут команд на SLAVE
- TTL команд LOCK на SLAVE: `2000U` мс

## Вопросы для исследования

1. Что происходит, если дверь на SLAVE открыта, а MASTER отправляет команду LOCK? Команда остается pending или сразу отвергается?
2. Как часто обновляется `physOpen` для удаленных дверей? Есть ли задержка?
3. Может ли быть проблема в том, что MASTER отправляет команду LOCK до того, как получит CAN STATUS о том, что дверь открыта?
4. Есть ли разница в поведении между первой командой LOCK и последующими (keepalive)?

---

**Дата создания:** 2026-01-25  
**Дата исправления:** 2026-01-25  
**Статус:** ✅ Исправление применено в `Doors_RequestLock`, требуется тестирование

## Исправления

### Попытка 2: Предотвращение перезаписи pending команды LOCK

**Проблема:** MASTER отправляет команды каждые 100ms, а STATUS приходит каждые 200ms. Это создает рассинхронизацию: MASTER может отправлять LOCK для открытой двери, затем UNLOCK, затем снова LOCK, создавая цикл переключений.

**Решение:** В функции `Doors_RequestLock` добавлена проверка:
- Если дверь открыта, есть pending LOCK, и приходит новая команда LOCK → не перезаписываем команду, только обновляем TTL

### Попытка 3: Предотвращение применения UNLOCK для уже разблокированных дверей

**Проблема:** MASTER отправляет UNLOCK для всех дверей, которые не в `lockRequired`, даже если они уже разблокированы. Это создает постоянные переключения, так как команда UNLOCK применяется всегда, даже если дверь уже разблокирована.

**Решение:** 
1. В `Doors_RequestLock`: если дверь уже разблокирована и приходит UNLOCK:
   - Если есть pending LOCK → отменяем его
   - Если есть pending UNLOCK → обновляем только TTL
   - Если нет pending → игнорируем команду

2. В `updateOneDoor`: команда UNLOCK применяется только если дверь заблокирована

### Код исправлений

**В `Doors_RequestLock`:**
```c
/* Случай 1: Дверь открыта, есть pending LOCK, приходит новая команда LOCK */
if (hasPending && !doorClosed && pendingLock && newLock)
{
    /* Не перезаписываем, только обновляем TTL */
    if (timeout_ms == 0U)
        s_lockReq[idx].expireMs = 0U;
    else
        s_lockReq[idx].expireMs = GetMs() + timeout_ms;
    return 1U;
}

/* Случай 2: Дверь уже разблокирована, приходит команда UNLOCK */
if (!newLock && (doorLocked == 0U))
{
    if (hasPending && pendingLock)
    {
        /* Отменяем pending LOCK */
        s_lockReq[idx].pending = 1U;
        s_lockReq[idx].lock_on = 0U;
        /* ... обновляем TTL ... */
    }
    else if (hasPending && !pendingLock)
    {
        /* Обновляем только TTL pending UNLOCK */
        /* ... */
    }
    /* Если нет pending, игнорируем */
    return 1U;
}
```

**В `updateOneDoor`:**
```c
if (!s_lockReq[idx].lock_on)
{
    /* Команда unlock: применяем только если дверь заблокирована */
    if (s_doors[idx].locked != 0U)
    {
        s_doors[idx].locked = 0U;
        s_doors[idx].lastChangeMs = now;
        s_lockReq[idx].pending = 0U;
    }
    else
    {
        /* Дверь уже разблокирована - просто сбрасываем pending */
        s_lockReq[idx].pending = 0U;
    }
}
```
