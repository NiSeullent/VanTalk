import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))

/** GitHub Pages SPA fallback: duplicate index.html as 404.html */
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const out = resolve(rootDir, 'dist')
      const index = resolve(out, 'index.html')
      if (existsSync(index)) {
        copyFileSync(index, resolve(out, '404.html'))
      }
    },
  }
}

export default defineConfig({
  base: '/VanTalk/',
  plugins: [react(), spaFallback()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
