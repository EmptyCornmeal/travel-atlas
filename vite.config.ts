import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/travel-atlas/' : '/',
  build: {
    outDir: 'docs',   // 👈 THIS is the fix
    sourcemap: true,
  },
})
