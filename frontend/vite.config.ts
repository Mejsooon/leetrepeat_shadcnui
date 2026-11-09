/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Monaco dołącza obsługę TypeScript/CSS/HTML/JSON z osobnymi workerami (~13 MB).
// Edytujemy tylko Pythona i C#, więc te moduły zastępujemy pustymi — dist jest wielokrotnie mniejszy.
function monacoWithoutLanguageServices(): Plugin {
  const EMPTY = '\0monaco-empty-feature'
  return {
    name: 'monaco-without-language-services',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || !importer.includes('monaco-editor')) return null
      if (!/languages\/features\/(typescript|css|html|json)\/register(\.js)?$/.test(source)) return null
      return EMPTY
    },
    load(id) {
      return id === EMPTY ? 'export {}' : null
    },
  }
}

// Testy dat liczą w czasie polskim (wyłapują błędy UTC po północy). Ustawione przed startem workerów.
process.env.TZ = 'Europe/Warsaw'

export default defineConfig({
  plugins: [monacoWithoutLanguageServices(), react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // W trybie deweloperskim (npm run dev) zapytania /api idą do FastAPI
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
