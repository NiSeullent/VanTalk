import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))
const docsOut = resolve(rootDir, '../docs')

/** Clear previous Vite publish artifacts without wiping markdown/branding. */
function cleanDocsPublish(): Plugin {
  return {
    name: 'clean-docs-publish',
    buildStart() {
      for (const name of ['index.html', '404.html', 'assets']) {
        rmSync(resolve(docsOut, name), { recursive: true, force: true })
      }
    },
  }
}

/** GitHub Pages SPA fallback: duplicate index.html as 404.html */
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const index = resolve(docsOut, 'index.html')
      if (existsSync(index)) {
        copyFileSync(index, resolve(docsOut, '404.html'))
      }
    },
  }
}

export default defineConfig({
  base: '/VanTalk/',
  plugins: [react(), cleanDocsPublish(), spaFallback()],
  build: {
    // Publish into /docs for GitHub Pages (legacy branch deploy).
    // Markdown + branding under docs/ are preserved (emptyOutDir: false).
    outDir: '../docs',
    emptyOutDir: false,
  },
})
