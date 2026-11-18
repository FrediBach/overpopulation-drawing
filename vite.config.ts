/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  worker: { format: 'es' },
  // three.js + the core pipeline are intentionally one chunk for the POC.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Building organic body assets takes a few hundred ms each.
    testTimeout: 60_000,
    coverage: { include: ['src/core/**'], reporter: ['text', 'html'] },
  },
})
