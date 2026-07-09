import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// NOTE: the `base` option below matters for GitHub Pages and we'll revisit
// it properly in Phase 3 — leaving it as '/' for now so local dev works.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
