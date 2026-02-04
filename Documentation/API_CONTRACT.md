# Industrial Door PLC — Контракт HTTP API (черновик)

Документ описывает минимальный HTTP API, введённый на **этапе 9**. Охватывает только то, что нужно для отладки Ethernet/HTTP и первой версии Web UI как *инструмента разработки и тестирования*.

## Транспорт

- HTTP-сервер работает **только на плате MASTER** (CAN NodeID=1).
- Порт: `g_project_cfg.net.webPort` (если 0 — по умолчанию 80).
- Кодировка: UTF-8.
- CORS: заголовок `Access-Control-Allow-Origin` задаётся из конфига (первые 64 байта `reserved_u32`); при пустой строке — `*`.

### Рекомендации по безопасности

- **HTTPS:** для защиты трафика между браузером и контроллером рекомендуется использовать HTTPS (этап 8 плана безопасности). При доступе по HTTP WebUI отображает предупреждение.
- Ограничение CORS по origin снижает риск вызова API с произвольных сайтов.

## Эндпоинты

Сейчас доступны:
- эндпоинты мониторинга (только чтение);
- **черновой** эндпоинт загрузки конфигурации (`PUT /api/config`) с частичным (merge) телом запроса.

### `GET /api/state`
Возвращает текущий снимок состояния системы.

Пример ответа:
```json
{
  "nodeId": 1,
  "role": 0,
  "linkUp": 1,
  "netReady": 1,
  "ip": "192.168.1.50",
  "uptimeSeconds": 123
}
```

### `GET /api/doors`
Возвращает текущее состояние дверей на MASTER (локальные двери 1..8).

Пример ответа:
```json
{
  "doors": [
    {
      "id": 1,
      "physClosed": 1,
      "locked": 0,
      "alarming": 0,
      "alarmReasons": 0,
      "openSeconds": 0,
      "closeDelayRemainingSeconds": 0
    }
  ]
}
```

Примечания:
- `openSeconds` вычисляется (если дверь открыта — секунды с момента перехода в OPEN, иначе 0).
- `closeDelayRemainingSeconds` вычисляется (если идёт задержка после закрытия — оставшиеся секунды, иначе 0).

### `GET /api/config`
Возвращает **небольшую часть** активной конфигурации (достаточно для раннего тестирования Web).

Пример ответа:
```json
{
  "formatVersion": 65537,
  "seq": 12,
  "projectName": "Demo",
  "doorCount": 8,
  "openTimeoutMs": 30000,
  "net": {"dhcpEnabled": 1, "webPort": 8080}
}
```

### `GET /api/journal/stat`
Возвращает статистику журнала событий.

Пример ответа:
```json
{
  "base": 1048576,
  "size": 262144,
  "sectorSize": 4096,
  "sectors": 64,
  "currentSector": 3,
  "currentSeq": 110,
  "recordsWritten": 200,
  "droppedQueue": 0,
  "ioErrors": 0
}
```

### `GET /api/journal/dump`
Возвращает записи журнала с постраничной выборкой. Записи идут в обратном хронологическом порядке (сначала новые).

Параметры запроса:
- `offset` (необязательный, по умолчанию 0) — сколько записей пропустить;
- `limit` (необязательный, по умолчанию 20, макс. 200) — максимум записей в ответе.

Пример запроса:
```
GET /api/journal/dump?offset=0&limit=10
```

Пример ответа:
```json
{
  "records": [
    {
      "recSeq": 110,
      "timestamp": 1234567890,
      "type": "DOOR_OPEN",
      "typeCode": 1,
      "source": "DOOR_LOCAL",
      "sourceCode": 1,
      "doorId": 1,
      "flags": 0,
      "arg": 0
    },
    {
      "recSeq": 109,
      "timestamp": 1234567880,
      "type": "DOOR_CLOSE",
      "typeCode": 2,
      "source": "DOOR_LOCAL",
      "sourceCode": 1,
      "doorId": 1,
      "flags": 0,
      "arg": 0
    }
  ],
  "count": 2,
  "offset": 0,
  "limit": 10
}
```

Примечания:
- Записи возвращаются в обратном хронологическом порядке (сначала новые).
- Если `offset` больше числа доступных записей, возвращается пустой массив с `count: 0`.
- В полях `type` и `source` есть и строковое значение, и числовой код.
- Поддерживаемые типы событий: `DOOR_OPEN`, `DOOR_CLOSE`, `DOOR_ALARM`, `DOOR_OPEN_TIMEOUT`, `DOOR_POST_CLOSE_READY`, `DOOR_SIGNAL_ON`, `DOOR_SIGNAL_OFF`, `CMD_LOCK`, `CMD_UNLOCK`, `NET_LINK_UP`, `NET_LINK_DOWN`, `SYSTEM_FAULT`.
- Поддерживаемые источники: `NONE`, `DOOR_LOCAL`, `SUPERVISOR`, `WATCHDOG`, `CAN`, `RS485`, `HTTP`.

### `PUT /api/config` (черновой merge)
Принимает **частичный** JSON: обновляются только переданные поля, остальные не меняются.

Цепочка обработки:
`JSON -> merge -> Config_Validate -> ConfigService_Persist(A/B) -> journal`

Поддерживаемые ключи (все необязательные):
- `projectName` (строка);
- `openTimeoutMs` (uint32);
- `net.dhcpEnabled` (bool или 0/1);
- `net.webPort` (uint16).

Пример тела запроса:
```json
{
  "projectName": "Demo",
  "openTimeoutMs": 45000,
  "net": {"dhcpEnabled": true, "webPort": 8080}
}
```

Успешный ответ (200):
```json
{"ok":1,"persistStatus":0,"seq":13}
```

Ошибка валидации (400):
```json
{"ok":0,"error":"openTimeoutMs out of range"}
```

Ошибка записи (500):
```json
{"ok":0,"persistStatus":2}
```

### `GET /api/config/mapping`
Возвращает сохранённую карту маппинга (редактор схемы помещений и дверей).

Формат ответа:
```json
{
  "version": 1,
  "projectName": "",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "objects": []
}
```

Если карта ещё не сохранялась — возвращается пустая карта (objects: []). Данные хранятся в QSPI Flash (сектор 4 КБ); после сброса контроллера карта загружается из QSPI при первом GET.

### `PUT /api/config/mapping`
Сохраняет карту маппинга в QSPI Flash. Тело запроса — JSON в том же формате, что и ответ GET (version, projectName, viewport, objects). Максимальный размер тела — 2048 байт (большие карты обрежутся). После успешного ответа карта сохраняется между перезагрузками контроллера.

Успех (200):
```json
{"ok":1}
```

Ошибка (400):
```json
{"ok":0,"error":"empty body"}
```

## Планируется (позже в рамках этапа 9)

- `/api/journal/dump` — постраничная выгрузка журнала;
- `/api/session/*` и `/api/login` — сессия и аутентификация.
