import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Ez teszi lehetővé a hálózati (IP alapú) elérést
    port: 5173
  },
  // Ha GitHub Pages-re töltenéd fel, itt add meg a repó nevét (pl. '/family-app/')
  // base: './' 
})
