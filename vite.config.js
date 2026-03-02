import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // PDF.js uses dynamic imports; pre-bundle to avoid issues
    include: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
})
