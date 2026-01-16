# Industrial Door PLC — Итоговое резюме по Этапам 2–3

Этот README составлен по анализу архива `APP_BSP_CORE_DOC.zip` (папки `App/`, `BSP/`, `Core/`, `Documentation/`).

## Структура проекта (как сейчас)
- `Core/` — CubeMX/STM32 HAL + FreeRTOS glue (`freertos.c`) + bring-up модули (lwip/can/rs485/qspi).
- `App/doors/` — логика двери (модель состояния, обработка датчиков/кнопки Alarm, управление индикацией/замком).
- `App/system/` — системные сервисы и задачи (EventBus, Health/Heartbeat, лог-очередь, RTOS tasks: net/can/rs485/http/logger/watchdog/supervisor/comms).
- `BSP/` — привязка GPIO к “железу” дверей (active-low выходы/входы).

---

# ЭТАП 2 — Базовая RTOS-архитектура прошивки

## 2.1 Выбор и настройка FreeRTOS
**Сделано (каркас + правила архитектуры):**
- FreeRTOS используется через CMSIS-OS (CubeMX), все задачи создаются централизованно в одном месте:  
  `Core/Src/freertos.c`.
- Добавлена защита от “возврата” из задач: `TaskShouldNeverReturn()` + `configASSERT(0)`.
- Исправлено предупреждение компилятора о неявном объявлении: `TaskShouldNeverReturn()` объявлен как `static` с прототипом до использования.  
  Файл: `Core/Src/freertos.c`.

## 2.2 Декомпозиция задач (созданы все задачи по плану)
**Сделано: задачи есть, заведены в CubeMX и создаются в `freertos.c`:**
- **DOOR TASK** → `App/doors/doors_task.c` (`DoorsTask_Run`)
- **LOGIC CORE TASK** (Comms) → `App/system/comms_task.c` (`CommsTask_Run`)
- **CAN TASK** → `App/system/can_task.c` (`CanTask_Run`)
- **RS-485 TASK** → `App/system/rs485_task.c` (`Rs485Task_Run`)
- **ETHERNET/HTTP TASK** (2 задачи: net + http)  
  - Net: `App/system/net_task.c` (`NetTask_Run`)  
  - HTTP: `App/system/http_task.c` (`HttpTask_Run`)
- **LOGGER TASK** → `App/system/logger_task.c` (`LoggerTask_Run`)
- **WATCHDOG/SUPERVISOR TASK** (2 задачи)  
  - Supervisor: `App/system/supervisor_task.c` (`SupervisorTask_Run`)  
  - Watchdog: `App/system/watchdog_task.c` (`WatchdogTask_Run`)

**Приоритеты и стеки (как сейчас в `freertos.c`):**
- Supervisor: `osPriorityHigh`
- Doors: `osPriorityAboveNormal`
- Watchdog: `osPriorityAboveNormal`
- Comms/CAN/RS485: `osPriorityNormal`
- HTTP/Logger: `osPriorityBelowNormal`
- Net: `osPriorityLow`
- Размеры стеков заданы в `osThreadDef(...)` (CMSIS-OS v1: в *словах*, не в байтах).

**Замечание по зрелости задач:**
- `net_task`, `can_task` и `rs485_task` уже делают базовый bring-up (инициализация линка/мониторинг).
- `http_task` и `comms_task` пока каркасные (heartbeat + delay), логика протоколов/маршрутизация будут развиваться в следующих этапах.

## 2.3 Межзадачное взаимодействие (Queues / Events / Mutex)
**Сделано:**
- **EventBus (единая очередь событий)** реализован и готов к использованию:
  - `App/system/app_events.h`
  - `App/system/app_events.c`
  - Очередь: `EVENT_QUEUE_LEN = 32`
  - API: `AppEvents_Publish()`, `AppEvents_Wait()`
  - Есть типы событий под двери/сеть/команды: `EVT_DOOR_OPEN/CLOSE/ALARM`, `EVT_CMD_LOCK/UNLOCK`, `EVT_NET_LINK_*`, `EVT_SYSTEM_FAULT`.

- **Очередь логов** реализована:
  - `App/system/app_log.h`
  - `App/system/app_log.c`
  - Очередь: `LOG_QUEUE_LEN = 32`
  - Сообщения фиксированного размера `APP_LOG_MSG_MAX` (по умолчанию 96)
  - API: `AppLog_Push()`, `AppLog_Pop()`
  - Вывод вынесен в слабую функцию `AppLog_Output()` (можно переопределить под UART/ITM/UDP).

**Частично (интеграция в бизнес-логику ещё впереди):**
- EventBus используется для публикации событий дверей (`doors_task.c` публикует `EVT_DOOR_OPEN/CLOSE/ALARM`), но:
  - `CommsTask` пока не потребляет/маршрутизирует события,
  - команды `EVT_CMD_LOCK/UNLOCK` пока не заведены в “ядро” управления дверьми.

## 2.4 Базовый watchdog и контроль зависаний
**Сделано (SW watchdog + supervisor safe-state):**
- `App/system/app_health.*` — heartbeat мониторинг:
  - Каждая задача периодически вызывает `AppHealth_Heartbeat(TASK_...)`
  - `AppHealth_IsAlive()` проверяет таймаут (сейчас `HEARTBEAT_TIMEOUT_MS = 2000`)

- `SupervisorTask` контролирует жизнеспособность набора задач и при проблеме включает safe-state:
  - `App/system/supervisor_task.c`

- `WatchdogTask`:
  - публикует `EVT_SYSTEM_FAULT`, если `Supervisor` “мертв”
  - опционально поддерживает аппаратный IWDG при `#define USE_IWDG`
  - `App/system/watchdog_task.c`

**Замечание (улучшение архитектуры):**
- `SupervisorTask` сейчас дергает `BSP_DoorIO_*` напрямую, минуя `DoorHAL`.  
  Логичнее перейти на `DoorHAL_ApplySafeState()` (в `App/doors/door_hal.c`) — так сохранится правило “BSP только внутри HAL”.

---

# ЭТАП 3 — Аппаратная модель двери (FW)

## 3.1 Реализация объекта «ДВЕРЬ»
**Сделано:**
- Реализована модель состояния двери `AppDoorState_t`:
  - `App/doors/doors_task.h`
  - поля: `physClosed`, `alarmPressed`, `locked`, `alarming`, `lastChangeMs`
- Доступ к массиву состояний: `Doors_GetStateArray()` (для будущего LogicCore/протоколов).

## 3.2 Работа с датчиком двери
**Сделано:**
- Датчик двери читается через HAL → BSP:
  - `DoorHAL_IsClosed()` → `BSP_DoorIO_ReadClosed()`
- BSP корректно учитывает active-low входы (RESET = “сработал”):
  - `BSP_IN_READ_IS_ON(...)` в `BSP/bsp_doors_io.c`

## 3.3 Управление замком-соленоидом
**Сделано:**
- Управление замком вынесено в DoorHAL:
  - `DoorHAL_SetLock()` → `BSP_DoorIO_SetLocked()`
- BSP реализует active-low управление соленоидом:
  - `BSP_OUT_WRITE(..., locked)` (RESET = ON) в `BSP/bsp_doors_io.c`

## 3.4 Инварианты безопасности
**Сделано:**
- **Запрет блокировки при открытой двери** реализован на двух уровнях:
  - В `DoorHAL_SetLock()` (если lock && дверь открыта → lock=false)
  - Дополнительно в `doors_task.c` есть принудительный “hard invariant”:
    - если дверь открыта → всегда unlock

- **SAFE-STATE при ошибках**:
  - `DoorHAL_ApplySafeState()` (unlock + buzzer off + green)
  - `SupervisorTask` применяет safe-state при падении health (пока через BSP напрямую).

## 3.5 Индикация и зуммер (базовая)
**Сделано:**
- Нормальный режим:
  - `GREEN` если unlocked, `RED` если locked
  - buzzer выключен
- Alarm режим:
  - мигание `RED/GREEN` по 1 секунде
  - buzzer в красной фазе
  - реализовано в `App/doors/doors_task.c` (`applySignaling()`)

## 3.6 Кнопка ALARM (локальный приоритет)
**Сделано (ключевой пункт):**
- Alarm работает как “локальный приоритет”:
  - нажатие переключает `alarming` (debounce ~50ms)
  - при входе в Alarm:
    - запоминается состояние lock до Alarm (`s_lockSavedBeforeAlarm[]`)
    - дверь принудительно разблокируется
    - запускается сигнализация
  - при выходе из Alarm:
    - восстанавливается lock-state, который был до Alarm
- В Alarm режиме замок **не “дергается”** от мигания (замок всегда unlock в signaling).
- Реализовано в: `App/doors/doors_task.c` (`updateOneDoor()`, `applySignaling()`)

---

# Что уже можно считать “готовым” по Этапам 2–3
- Прошивка организована как система задач (RTOS), а не набор функций.
- Есть центральные системные сервисы:
  - EventBus (очередь событий)
  - Health/Heartbeat (контроль зависаний)
  - Log queue + LoggerTask
- Есть базовый supervisor/watchdog контур.
- Есть аппаратная модель двери:
  - датчик, замок, индикация, buzzer
  - безопасные инварианты
  - Alarm как локальный приоритет с корректным поведением “unlock пока Alarm активен”

---

# Остатки/следующие шаги (что ещё не закрыто в рамках этапов/плана)
Ниже — не “ошибки”, а естественные хвосты, которые обычно закрываются следующими этапами:

1) **Logic Core (CommsTask) пока каркас**
   - нет маршрутизации событий и команд
   - нет обработки `EVT_CMD_LOCK/UNLOCK` (которые уже описаны в `app_events.h`)
   - рекомендуется:
     - принимать события из `AppEvents_Wait()`
     - переводить команды в изменения `Doors_GetStateArray()[i].locked` (или через отдельный API дверей)

2) **HTTP задача пока каркас**
   - нет поднятого httpd/REST
   - нет конфигурации через web (по вашей цели)

3) **CAN/RS485** пока “bring-up + heartbeat”
   - протоколы и обмен состояниями будут добавляться дальше

4) **Supervisor → HAL**
   - перенести safe-state с `BSP_DoorIO_*` на `DoorHAL_ApplySafeState()` (чтобы BSP не дергался напрямую вне HAL).

---

# Быстрые ссылки на ключевые файлы
- RTOS glue: `Core/Src/freertos.c`
- EventBus: `App/system/app_events.c/.h`
- Health: `App/system/app_health.c/.h`
- Logs: `App/system/app_log.c/.h`, `App/system/logger_task.c`
- Doors logic: `App/doors/doors_task.c/.h`
- Door HAL: `App/doors/door_hal.c/.h`
- Door BSP: `BSP/bsp_doors_io.c/.h`
- Supervisor/Watchdog: `App/system/supervisor_task.c`, `App/system/watchdog_task.c`
