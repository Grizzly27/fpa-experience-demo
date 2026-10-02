import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/fpa-experience-demo/
export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE ?? '/fpa-experience-demo/',
})
