# Industrial Door PLC — HTTP API Contract (Draft)

This document is the **living contract** for the minimal HTTP API introduced in **Stage 9**.
It is intentionally small: only what we need to debug Ethernet/HTTP and to support the first
iteration of the Web UI as a *dev/test tool*.

## Transport

- HTTP server runs **only on MASTER board** (CAN NodeID=1).
- Port: `g_project_cfg.net.webPort` (if 0 → default 80).
- Encoding: UTF-8.
- Responses include `Access-Control-Allow-Origin: *` for faster browser testing.

## Endpoints

At this point we provide:
- read-only monitoring endpoints
- a **draft** config upload endpoint (`PUT /api/config`) with a small merge payload

### `GET /api/state`
Returns current system snapshot.

Example response:
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
Returns current snapshot of doors hosted on the MASTER (local doors 1..8).

Example response:
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

Notes:
- `openSeconds` is computed (if open → seconds since entering OPEN, else 0).
- `closeDelayRemainingSeconds` is computed (if post-close pending → remaining, else 0).

### `GET /api/config`
Returns a **small subset** of the active configuration (enough for early Web testing).

Example response:
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
Returns journal statistics.

Example response:
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
Returns journal records with pagination support. Records are returned in reverse chronological order (newest first).

Query parameters:
- `offset` (optional, default: 0) - number of records to skip
- `limit` (optional, default: 20, max: 200) - maximum number of records to return

Example request:
```
GET /api/journal/dump?offset=0&limit=10
```

Example response:
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

Notes:
- Records are returned in reverse chronological order (newest first)
- If `offset` exceeds available records, returns empty array with `count: 0`
- `type` and `source` fields include both human-readable string and numeric code
- Supported event types: `DOOR_OPEN`, `DOOR_CLOSE`, `DOOR_ALARM`, `DOOR_OPEN_TIMEOUT`, `DOOR_POST_CLOSE_READY`, `DOOR_SIGNAL_ON`, `DOOR_SIGNAL_OFF`, `CMD_LOCK`, `CMD_UNLOCK`, `NET_LINK_UP`, `NET_LINK_DOWN`, `SYSTEM_FAULT`
- Supported sources: `NONE`, `DOOR_LOCAL`, `SUPERVISOR`, `WATCHDOG`, `CAN`, `RS485`, `HTTP`

### `PUT /api/config` (draft merge upload)
Uploads a *partial* JSON payload. Only provided keys are updated; others remain unchanged.

Pipeline:
`JSON -> merge -> Config_Validate -> ConfigService_Persist(A/B) -> journal`

Supported keys (optional):
- `projectName` (string)
- `openTimeoutMs` (uint32)
- `net.dhcpEnabled` (bool or 0/1)
- `net.webPort` (uint16)

Request example:
```json
{
  "projectName": "Demo",
  "openTimeoutMs": 45000,
  "net": {"dhcpEnabled": true, "webPort": 8080}
}
```

Success response (200):
```json
{"ok":1,"persistStatus":0,"seq":13}
```

Validation error (400):
```json
{"ok":0,"error":"openTimeoutMs out of range"}
```

Persist error (500):
```json
{"ok":0,"persistStatus":2}
```

## Planned (later in Stage 9)

- `/api/journal/dump` — paged download
- `/api/session/*` and `/api/login` — session + authentication
