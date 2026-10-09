import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { precacheServiceWorker } from './scripts/sw-plugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheServiceWorker()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    // Icons stay separate, cacheable files so a screen only downloads the icons it shows.
    assetsInlineLimit: (file) => (file.includes('/src/icons/') ? false : undefined),
    rolldownOptions: {
      output: {
        // Vendors change rarely; separate chunks stay cached across app releases.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/, priority: 3 },
            { name: 'ui', test: /node_modules[\\/](@radix-ui|vaul|sonner|react-remove-scroll|tailwind-merge|clsx|class-variance-authority)/, priority: 2 },
            { name: 'forms', test: /node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/, priority: 2 },
            { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/, priority: 2 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    // The API's CORS list already allows 5173; the proxy keeps dev same-origin anyway.
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:4100', changeOrigin: true } },
  },
})
