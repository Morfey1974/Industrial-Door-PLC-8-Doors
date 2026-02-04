# Industrial Door PLC

Прошивка и Web‑интерфейс промышленного контроллера дверей по тезисному плану разработки (Этапы 0–9+).

---

## Типы дверей и NC-логика

- **NO (нормально открытая):** по умолчанию замок отпущен (зелёный). Кнопка Alarm включает/выключает сигнализацию (мигание, пищалка).
- **NC (нормально закрытая):** по умолчанию замок зажат (красный). Кнопка Alarm — **импульс разблокировки** (без сигнализации):
  - Разблокировка возможна только если LogicCore не требует блокировку (нет зависимостей от другой открытой двери).
  - По нажатию открывается **окно разблокировки** (по умолчанию 5 с); повторное нажатие продлевает окно.
  - Если дверь не открыли до истечения окна — замок снова блокируется.
  - После физического закрытия — задержка (по умолчанию 1 с), затем замок блокируется.

Параметры NC в конфиге: `ncUnlockWindowMs` (окно разблокировки, 100–60000 мс), `ncLockDelayAfterCloseMs` (задержка блокировки после закрытия, 0–30000 мс). Подробнее — **`Documentation/Спецификация.md`**.

---

## Структура проекта

- **`Core/`** — CubeMX/STM32 HAL, FreeRTOS (`freertos.c`), bring-up (LwIP, CAN, RS-485, QSPI).
- **`BSP/`** — привязка GPIO к железу (входы/выходы дверей).
- **`App/doors/`** — модель двери, DoorTask (датчик, замок, индикация, Alarm, таймеры, окно/задержка NC).
- **`App/logic/`** — Logic Core, зависимости дверей, `LogicCore_IsLockRequired` (приоритет разблокировки NC).
- **`App/system/`** — EventBus, health/heartbeat, лог‑очередь; задачи RTOS (net, CAN, RS-485, HTTP, logger, watchdog, supervisor, comms).
- **`App/config/`** — формат конфигурации (в т.ч. `ncUnlockWindowMs`, `ncLockDelayAfterCloseMs`), хранилище в QSPI, атомарная активация (слоты A/B); хеширование паролей (SHA-256), криптостойкая случайность (RNG).
- **`App/log/`** — журнал событий в QSPI (кольцевой лог).
- **`WebUI/`** — React‑приложение (Vite): вход по логину/паролю, Dashboard, мониторинг дверей/событий, конфигурация дверей, редактор маппинга.

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
  - Публичные: `POST /api/auth/login` (логин; ограничение 5 попыток за 15 мин, 429 при превышении).
  - С токеном: `GET /`, `/api/state`, `/api/doors`, `/api/config`, `/api/config/full`, `/api/config/mapping`, `/api/journal/stat`, `/api/journal/dump`; `PUT /api/config`, `/api/config/full`, `/api/config/mapping`; `POST /api/auth/change-password`, `/api/auth/forgot-password`, `/api/auth/reset-password`; CRUD пользователей (`/api/users`, `/api/users/:username`).
  - Сессионные токены (Bearer), проверка ролей (super_admin, admin, operator). CORS из конфига (или `*`).
- **9.4 Web UI (React):** Вход (логин/пароль), Dashboard, Мониторинг (Двери, События), Конфигурация → Настройка дверей (общие параметры, двери, зависимости, таймауты), редактор маппинга. Экспорт/импорт JSON, автосохранение черновика, применение на контроллер. При применении конфигурации — редирект на страницу входа с сообщением о перезагрузке.

**Поведение при применении конфигурации:** после успешной записи в QSPI плата выполняет автосброс (`HAL_NVIC_SystemReset`), конфиг подхватывается при загрузке; WebUI перенаправляет на `/login?reason=config_applied`.

### Безопасность (план в `Documentation/SECURITY_REMEDIATION_PLAN.md`)

- **Этапы 1–2:** Проверка токена на API, отправка токена с WebUI (Authorization: Bearer).
- **Этап 3:** Хеширование паролей SHA-256 с солью (RNG); совместимость со старым хешем при первом входе.
- **Этап 4:** Токен сброса пароля — 32 байта криптостойкой случайности (hex).
- **Этап 5:** CORS — origin из конфига (`HttpApi_GetCorsOrigin`).
- **Этап 6:** Защита от перебора — 5 неудачных попыток входа за 15 минут по username, затем 429 с задержкой 3 с.
- **Этап 7:** Сессионный токен — 15 байт RNG (30 hex), таблица сессий в RAM, срок 24 ч.
- **Этап 8 (HTTPS):** в плане; в WebUI при HTTP показывается предупреждение о незашифрованном трафике.

---

## Ключевые файлы

| Назначение        | Файлы |
|-------------------|-------|
| Конфигурация      | `App/config/config_format.c/.h`, `config_layout.h`, `config_storage_qspi.c/.h`, `config_service.c/.h` |
| Пароли, сессии    | `App/config/password_hash.c/.h`, `secure_random.c/.h`, `App/system/users_service.c/.h` |
| Журнал событий    | `App/log/event_journal.c/.h`, `App/system/journal_task.c/.h` |
| HTTP / REST       | `App/system/http_server.c/.h`, `http_api.c/.h`, `http_task.c/.h`, `json_simple.c/.h` |
| Двери             | `App/doors/doors_task.c/.h`, `door_hal.c/.h` |
| Логика            | `App/logic/logic_core.c` |
| Web UI            | `WebUI/` — React, Vite; см. `WebUI/README.md`, `WebUI/INSTALL_VS.md` |

---

## Память и буферы

- **HTTP:** `HTTP_RX_BUF_SZ` 768 B, `HTTP_BODY_MAX` 8192 B (полная конфигурация до 16 дверей), буфер ответа 8 KB. `limit` для `/api/journal/dump`: до 50 записей.
- **Стеки (FreeRTOS):** `httpTask` 16 KB, остальные по 2–3 KB. Heap 64 KB.
- **Отладка HTTP:** по умолчанию выключена (`HTTP_DEBUG_ENABLED 0` в `App/system/http_server.h`); при необходимости включить для логов запросов/ответов.

---

## Документация

Вся проектная документация в каталоге **`Documentation/`**:

| Документ | Описание |
|----------|----------|
| **`API_CONTRACT.md`** | Контракт REST API, рекомендации по безопасности (HTTPS, CORS). |
| **`SECURITY_REMEDIATION_PLAN.md`** | План устранения уязвимостей (этапы 1–8), статус реализации. |
| **`VERIFICATION_SECURITY_ETAP1_2.md`** | Проверка этапов 1–2 (токен, защита маршрутов). |
| **`Спецификация.md`** | Спецификация NC-двери (окно разблокировки, задержка после закрытия). |
| **`План_UI.md`** | План Web UI. |
| **`CONFIG_APPLY_FULL_PLAN.md`** | План и реализация полной загрузки конфигурации (вариант A). |
| **`JOURNAL_DIAGNOSTIC.md`** | Диагностика журнала событий. |
| **`АНАЛИЗ_ПАМЯТИ_И_БУФЕРОВ.md`**, **`АНАЛИЗ_ИСПОЛЬЗОВАНИЯ_ПАМЯТИ.md`**, **`АНАЛИЗ_МАСШТАБИРУЕМОСТИ_КОНФИГУРАЦИИ.md`**, **`ИНСТРУКЦИЯ_МОНИТОРИНГА_ПАМЯТИ.md`** | Анализ памяти и масштабируемости. |
| Остальные `.md` и PDF | Handoff, решения конфликтов, планы разработки. |

**WebUI:** `WebUI/README.md`, `WebUI/INSTALL_VS.md` — запуск и интеграция в Visual Studio; прочие руководства в `WebUI/` (SECURITY, USER_PERMISSIONS, DESIGN_2025_*, MAPPING_EDITOR_PLAN и др.).
