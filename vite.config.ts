import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const emptyNodeModule = path.resolve(
  import.meta.dirname,
  './src/shims/emptyNodeModule.ts',
)

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  // Match the dev worker format to production so an ESM worker loads the same
  // way in both. The client creates it with { type: "module" }.
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // OpenCV's universal bundle statically references these in its
      // unreachable Node-only branch. Browser builds intentionally shim them.
      crypto: emptyNodeModule,
      fs: emptyNodeModule,
      path: emptyNodeModule,
    },
  },
})
