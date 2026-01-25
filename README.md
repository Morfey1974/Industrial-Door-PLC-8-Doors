# Industrial Door PLC

Прошивка и Web‑интерфейс промышленного контроллера дверей по тезисному плану разработки (Этапы 0–9+).

---

## Структура проекта

- **`Core/`** — CubeMX/STM32 HAL, FreeRTOS (`freertos.c`), bring-up (LwIP, CAN, RS-485, QSPI).
- **`BSP/`** — привязка GPIO к железу (входы/выходы дверей).
- **`App/doors/`** — модель двери, DoorTask (датчик, замок, индикация, Alarm, таймеры).
- **`App/logic/`** — Logic Core, зависимости дверей.
- **`App/system/`** — EventBus, health/heartbeat, лог‑очередь; задачи RTOS (net, CAN, RS-485, HTTP, logger, watchdog, supervisor, comms).
- **`App/config/`** — формат конфигурации, хранилище в QSPI, атомарная активация (слоты A/B).
- **`App/log/`** — журнал событий в QSPI (кольцевой лог).
- **`WebUI/`** — React‑приложение (Vite): Dashboard, мониторинг дверей/событий, конфигурация дверей.

---

## Статус по этапам

### Этапы 0–6 (база)

- **0–2:** База проекта, драйверы, bring-up, RTOS, EventBus, Log Queue, Health/Supervisor/Watchdog.
- **3–4:** DoorHAL, DoorTask, безопасность (lock при открытой двери, safe-state, Alarm).
- **5:** Logic Core, зависимости дверей (дверь → блокируемые двери).
- **6:** CAN master–slave, NodeId, heartbeat, Degraded‑режим.

### Этап 7 — Хранение и журналирование (FW)

- **7.1–7.3:** Формат конфигурации (`config_format.h`), хранение в QSPI (`config_storage_qspi`), атомарная активация (слоты A/B, commit последним). Сервис: `config_service.c/.h`.
- **7.4:** Журнал событий в QSPI (`event_journal`). События OPEN/CLOSE/ALARM, системные/сетевые.
- **7.5:** Кольцевой буфер, wear‑leveling, статистика (запись/дроп/erase).

### Этап 9 — Ethernet + HTTP + Web UI

- **9.1–9.2:** LwIP, NetTask, HTTP‑сервер на MASTER (`http_server.c`, `http_task.c`).
- **9.3 REST API:**
  - `GET /`, `/api/state`, `/api/doors`, `/api/config`, `/api/config/full`, `/api/journal/stat`, `/api/journal/dump`
  - `PUT /api/config` — merge (projectName, openTimeoutMs, net)
  - `PUT /api/config/full` — полная конфигурация (doors, edges, postCloseTimeouts), лимиты v1: 8 дверей, 16 edges, 8 postClose.
- **9.4 Web UI (React):** Dashboard, Мониторинг (Двери, События), Конфигурация → Настройка дверей (общие параметры, двери, зависимости, таймауты). Экспорт/импорт JSON, автосохранение черновика, применение на контроллер.

**Поведение при применении конфигурации:** после успешной записи в QSPI плата выполняет автосброс (`HAL_NVIC_SystemReset`), конфиг подхватывается при загрузке.

---

## Ключевые файлы

| Назначение        | Файлы |
|-------------------|-------|
| Конфигурация      | `App/config/config_format.c/.h`, `config_layout.h`, `config_storage_qspi.c/.h`, `config_service.c/.h` |
| Журнал событий    | `App/log/event_journal.c/.h`, `App/system/journal_task.c/.h` |
| HTTP / REST       | `App/system/http_server.c/.h`, `http_api.c/.h`, `http_task.c/.h`, `json_simple.c/.h` |
| Двери             | `App/doors/doors_task.c/.h`, `door_hal.c/.h` |
| Логика            | `App/logic/logic_core.c` |
| Web UI            | `WebUI/` — React, Vite; `WebUI/README.md`, `План_UI.md` |

---

## Память и буферы

- **HTTP:** `HTTP_RX_BUF_SZ` 768 B, `HTTP_BODY_MAX` 2048 B, буфер ответа 8 KB. `limit` для `/api/journal/dump`: до 50 записей.
- **Стеки (FreeRTOS):** `httpTask` 16 KB, остальные по 2–3 KB. Heap 64 KB.

---

## Документация

- **`API_CONTRACT.md`** — контракт REST API.
- **`CONFIG_APPLY_FULL_PLAN.md`** — план и реализация полной загрузки конфигурации (вариант A).
- **`План_UI.md`** — план Web UI.
- **`WebUI/README.md`**, **`WebUI/INSTALL_VS.md`** — запуск и интеграция в Visual Studio.
