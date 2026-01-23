import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  // Vite автоматически использует public/index.html, если он существует
  // Если нужно указать явно:
  // root: './',
  // publicDir: 'public',
})
