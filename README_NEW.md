# Industrial Door PLC — состояние проекта по плану (Этапы 0–7)

Этот README — **актуальное резюме того, что реализовано в прошивке** Industrial Door PLC (STM32H723) по результатам анализа текущего архива проекта и прикреплённых PDF‑планов.

Фокус: **Этапы 0–7 (FW)** — bring‑up, RTOS‑архитектура, модель двери, события и таймауты, Logic Core (зависимости), конфигурация в QSPI (A/B + атомарность), журнал событий в QSPI + CLI по UART3.

---

## 1) Структура проекта

- `Core/` — HAL/CubeMX glue: `main.c`, `freertos.c`, `usart.c`, `stm32h7xx_it.c`, bring‑up файлов (lwip/can/octospi и т.п.).
- `BSP/` — привязка GPIO/линий к «железу» (I/O дверей/LED/замков), низкоуровневые функции.
- `App/doors/` — DoorHAL и DoorTask (модель двери, сенсор, замок, индикация, локальная сигнализация).
- `App/logic/` — Logic Core + зависимости дверей.
- `App/system/` — системные сервисы и задачи: event bus, log queue, health/heartbeat, net/http/can/rs485/comms/logger/watchdog/supervisor, сервис конфигурации, QSPI lock, UART3 CLI.
- `App/config/` — формат конфигурации + хранение конфигурации в QSPI.
- `App/log/` — журнал событий в QSPI (кольцевой лог) + сервисные функции dump/stat/clear.

---

## 2) Статус по этапам плана

Ниже — статус по тезисному плану (PDF), с привязкой к текущим файлам проекта.

### Этап 0 — Подготовительный (база проекта)
**Сделано:** проект собирается и запускается; зафиксирована базовая структура модулей FW.

### Этап 1 — Аппаратный слой и низкоуровневые драйверы
**Сделано:** подняты интерфейсы/bring‑up на уровне HAL/BSP: GPIO дверей/индикации, таймеры, Ethernet (LwIP), CAN, RS‑485, QSPI/OSPI.

### Этап 2 — Базовая RTOS‑архитектура прошивки
**Сделано:**
- Все задачи создаются централизованно в `Core/Src/freertos.c`.
- Реализован набор задач по декомпозиции плана:
  - `DoorsTask` — управление дверями (`App/doors/doors_task.*`)
  - `CommsTask`/Logic Core (`App/system/comms_task.*` + `App/logic/*`)
  - `CanTask` (`App/system/can_task.*`)
  - `Rs485Task` (`App/system/rs485_task.*`)
  - `NetTask` (`App/system/net_task.*`)
  - `HttpTask` (`App/system/http_task.*`)
  - `LoggerTask` (`App/system/logger_task.*`)
  - `SupervisorTask` (`App/system/supervisor_task.*`)
  - `WatchdogTask` (`App/system/watchdog_task.*`)
  - `JournalTask` (`App/system/journal_task.*`)
- Межзадачные сервисы:
  - EventBus: `App/system/app_events.c/.h`
  - Log queue: `App/system/app_log.c/.h`
  - Health/heartbeat: `App/system/app_health.c/.h`

### Этап 3 — Аппаратная модель двери
**Сделано:**
- DoorHAL: `App/doors/door_hal.c/.h` — безопасные операции (lock/led/buzzer и т.п.) с инвариантами.
- DoorTask: `App/doors/doors_task.c/.h` — состояния двери, чтение датчика, управление замком и индикацией.
- Инварианты безопасности (в духе плана):
  - запрет блокировки при открытой двери;
  - safe‑state при ошибках.

### Этап 4 — Логика двери и события
**Сделано:**
- События (OPEN/CLOSE/POST_CLOSE_READY и др.) формируются и публикуются через EventBus.
- Таймауты (open timeout / post‑close) заведены в модель.
- Локальный Alarm — как приоритетный режим (сигнализация + нужное поведение замка) реализован на уровне логики двери.

### Этап 5 — Logic Core (зависимости дверей)
**Сделано:**
- Модель зависимостей реализована в `App/logic/logic_deps.*`.
- Logic Core в `App/logic/logic_core.*` получает события и может формировать команды/реакции (в т.ч. с учётом конфигурации).

### Этап 6 — CAN master–slave
**Сделано (каркас):**
- Базовый протокольный слой/заготовки: `App/system/can_proto.*`.
- Heartbeat/диагностика и основа degraded‑режима заложены на уровне задач и состояния узла.

---

## 3) Этап 7 — Хранение данных и журналирование (FW)

Этап 7 по плану: сделать систему **воспроизводимой и диагностируемой**.

### 7.1 Формат конфигурации
Файлы:
- `App/config/config_format.c/.h`
- `App/config/config_layout.h`

Реализовано:
- структура конфигурации, версии/лимиты;
- дефолтная конфигурация;
- валидация;
- CRC32 (используется в хранении/проверках).

### 7.2 Хранение конфигурации в QSPI Flash
Файлы:
- `App/config/config_storage_qspi.c/.h`

Реализовано:
- хранение в QSPI;
- слотная схема A/B;
- служебные заголовки и проверка целостности.

### 7.3 Атомарная активация конфигурации
Файлы:
- `App/system/config_service.c/.h`

Реализовано:
- на boot выбирается валидный слот (A/B) по seq/CRC;
- при power‑cut исключается применение частично записанного конфига;
- на UART присутствует диагностика вида `CFG: slot A OK (seq=...)`.

### 7.4 Журнал событий (QSPI) + CLI
Файлы:
- Журнал (QSPI ring‑log): `App/log/event_journal.c/.h`
- Задача журнала: `App/system/journal_task.c/.h`
- CLI по UART3: `App/system/app_log_uart3.c/.h`

Реализовано:
- кольцевой журнал событий в области QSPI (`base/size/sector_size`), формат секторного заголовка и записей, CRC;
- постановка событий в очередь (non‑blocking), запись во Flash из `JournalTask`;
- CLI команды:
  - `log help`
  - `log stat`
  - `log dump [N]`
  - `log clear` (с сообщением `JOURNAL: clearing...` → `JOURNAL: cleared`)

CLI реализован устойчиво к разным терминалам:
- приём UART3 через **ReceiveToIdle**;
- команды могут завершаться как CR/LF, так и «по паузе» (idle), даже если терминал не шлёт line ending.

### 7.5 Управление износом памяти
Реализовано в `event_journal.c`:
- запись «ходит» по секторам (кольцо), стирание/переключение сектора;
- статистика (`log stat`) показывает базовые счётчики (records, dropped, io_errors).



