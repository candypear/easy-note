import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

const alias = {
  '@shared': resolve('src/shared'),
  '@main': resolve('src/main'),
  '@preload': resolve('src/preload'),
  '@renderer': resolve('src/renderer')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      }
    }
  },
  renderer: {
    root: '.',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: { alias },
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: { index: resolve('index.html') }
      }
    }
  }
})
