import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * HTTP на МК: один запрос за раз в HttpServer_PollOnce; lwIP под нагрузкой сбрасывает
 * лишние TCP — в логе Vite «read ECONNRESET» на /api/doors при параллельных запросах
 * (/state, /doors, журнал…). Поэтому:
 * - keepAlive: false — МК закрывает сокет после ответа;
 * - maxSockets: 1 — все запросы прокси к одной цели выстраиваются в очередь на стороне Node.
 */
const proxyToMcuAgent = new http.Agent({ keepAlive: false, maxSockets: 1 })

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  /* Переменные из .env.development / .env — для proxy нужен адрес платы. */
  const env = loadEnv(mode, path.resolve(__dirname, '.'), '')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://192.168.1.50'

  if (mode === 'development') {
    /* Видно в окне, где запущен npm run dev — сверка с IP/webPort на МК. */
    console.log(`\n[Vite dev] прокси /api → ${proxyTarget}`)
    console.log('  Задаётся в WebUI/.env.development (VITE_DEV_PROXY_TARGET).')
    console.log('  Нет связи в UI: проверьте IP; если HTTP на МК на порту 8080 — добавьте :8080 к URL.')
    console.log('  Прокси: maxSockets:1, Connection: close к МК.\n')
  }

  const apiProxy = {
    '/api': {
      target: proxyTarget,
      changeOrigin: true,
      secure: false,
      agent: proxyToMcuAgent,
      /* Добавляется к исходящему запросу на МК до отправки (Node 24: позже proxyReq.setHeader даёт ERR_HTTP_HEADERS_SENT). */
      headers: {
        Connection: 'close',
      },
      /* /api/doors может отвечать долго; МК однопоточный HTTP — запас по времени. */
      timeout: 180000,
      proxyTimeout: 180000,
      configure: (proxy) => {
        proxy.on('error', (err, req, res) => {
          console.error('[Vite proxy /api]', err?.message || err, '| target:', proxyTarget)
          /* Ответ браузеру только если заголовки ещё не ушли (иначе падение процесса Vite). */
          try {
            if (res && typeof res.writeHead === 'function' && !res.headersSent && !res.writableEnded) {
              res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('Прокси Vite: нет ответа от контроллера. См. консоль npm run dev и .env.development.')
            }
          } catch (e) {
            console.error('[Vite proxy /api] не удалось отправить 502:', e?.message || e)
          }
        })
      },
    },
  }

  return {
    plugins: [react()],
    server: {
      port: 3000,
      /* Доступ по LAN с телефона/второго ПК: тот же dev + proxy на плату. */
      host: true,
      open: true,
      proxy: apiProxy,
    },
    preview: {
      port: 3000,
      host: true,
      /* Собранный UI через vite preview тоже ходит на /api → плата (иначе снова CORS). */
      proxy: apiProxy,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})
