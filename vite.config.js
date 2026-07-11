import { defineConfig } from 'vite'

// Serve the concept-art folder as static assets (used for UI portraits).
export default defineConfig({
  publicDir: 'exampleassets',
  server: { port: 5173 },
})
