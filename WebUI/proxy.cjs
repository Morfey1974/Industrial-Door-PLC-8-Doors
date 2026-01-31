#!/usr/bin/env node
/**
 * HTTP-прокси для обхода изоляции Wi-Fi.
 * Запускается на локальном ПК (подключённом к контроллеру).
 * Удалённый браузер обращается к прокси, прокси пересылает запросы контроллеру.
 *
 * Запуск: node proxy.cjs [порт] [IP_контроллера:порт]
 * Пример: node proxy.cjs 3080 192.168.1.50:80
 */

const http = require('http');
const url = require('url');

const PROXY_PORT = parseInt(process.argv[2], 10) || 3080;
const TARGET = process.argv[3] || '192.168.1.50:80';
const [TARGET_HOST, TARGET_PORT] = TARGET.includes(':')
  ? TARGET.split(':')
  : [TARGET, '80'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

function forwardRequest(clientReq, clientRes) {
  const path = clientReq.url || '/';
  const targetUrl = `http://${TARGET_HOST}:${TARGET_PORT}${path}`;
  const parsed = url.parse(targetUrl);

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || 80,
    path: parsed.path,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: `${TARGET_HOST}:${TARGET_PORT}` }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Убираем CORS-заголовки контроллера, чтобы не было дубликата (*, *) — оставляем только свои
    const corsKeys = ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-max-age', 'access-control-expose-headers'];
    const filtered = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (!corsKeys.includes(k.toLowerCase())) filtered[k] = v;
    }
    const headers = { ...filtered, ...CORS_HEADERS };
    clientRes.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Прокси] Ошибка к контроллеру ${TARGET}:`, err.message);
    clientRes.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    clientRes.end(JSON.stringify({ ok: 0, error: 'Контроллер недоступен' }));
  });

  clientReq.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  forwardRequest(req, res);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[Прокси] Слушает порт ${PROXY_PORT}, перенаправляет на http://${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`[Прокси] Для удалённого доступа укажите в WebUI: http://<IP_этого_ПК>:${PROXY_PORT}`);
});
