# Переход в новый чат — контекст для продолжения работы

Скопируй это сообщение в **новый чат** при продолжении работы над проектом **Industrial Door PLC**.

---

## Проект

- **Репозиторий:** https://github.com/Morfey1974/Industrial-Door-PLC  
- **Среда:** STM32CubeIDE (firmware), React + Vite (WebUI), Visual Studio для WebUI при желании.

## Что сделано на данный момент

- **Firmware (STM32):** Этапы 0–6, 7, 9.1–9.3. Конфигурация в QSPI (слоты A/B), журнал событий, HTTP REST API.  
  - `GET /api/state`, `/api/doors`, `/api/config`, `/api/config/full`, `/api/journal/stat`, `/api/journal/dump`  
  - `PUT /api/config` (merge), `PUT /api/config/full` (полная конфигурация: doors, edges, postCloseTimeouts). Лимиты v1: 8 дверей, 16 edges, 8 postClose.  
  - После успешной записи конфигурации плата делает **автосброс** (`HAL_NVIC_SystemReset`), конфиг подхватывается при загрузке.  
- **Web UI (React):** Dashboard, Мониторинг (Двери, События), Конфигурация → Настройка дверей (общие параметры, двери, зависимости, таймауты). Экспорт/импорт JSON, автосохранение черновика, применение на контроллер.  
  - Экспорт: при поддержке браузером — окно «Сохранить как» (`showSaveFilePicker`), иначе скачивание в папку по умолчанию.  
  - Таймауты в секундах: «Таймаут, когда дверь долго открыта» — по умолчанию 30 с; «Таймаут post-close» — по умолчанию 0 с.  
- **Парсер конфигурации:** `json_simple` расширен (`Json_FindArraySpan`, `Json_ArrayNextObject`), разбор массивов doors/edges/postCloseTimeouts в `put_config_full`.

## Важные файлы

- План полной загрузки конфигурации: `CONFIG_APPLY_FULL_PLAN.md`  
- API: `API_CONTRACT.md`  
- План UI: `План_UI.md`  
- Формат конфигурации: `App/config/config_format.h`, `config_storage_qspi.c`  
- HTTP API: `App/system/http_api.c`, `http_server.c`  
- Web UI: `WebUI/`, страница конфигурации дверей — `WebUI/src/pages/Configuration/DoorsConfig.jsx` и вкладки в `DoorsConfigTabs/`.

## Отложено / дальше

- **«Загрузить с контроллера»** — кнопка есть в UI, логика не реализована (сначала сделали «Применить»).  
- Вариант B плана: доработки UI (остальные страницы конфигурации, мониторинг — алармы, статистика).  
- Этапы 9.4 (WEB-сеанс), 9.5 (аутентификация) — не делались.  
- Поддержка SLAVE-досок в UI (когда API будет отдавать двери SLAVE).

## Как продолжить

1. Открыть проект в Cursor (workspace `Industrial Door PLC`).  
2. При необходимости — «Сохранить в репозиторий»: коммит и пуш в `main` уже настроены, репозиторий указан.  
3. Опиши задачу (например: «Реализуй „Загрузить с контроллера“» или «Добавь страницу X»).  
4. Для сборки: firmware — `make` в `Debug/`; WebUI — `npm run build` или `npm run dev` в `WebUI/`.

---

*Файл создан для корректного перехода в новый чат. После использования можно удалить или оставить как справку.*
