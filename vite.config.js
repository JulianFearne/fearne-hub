import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base is '/' because fearne.org is a custom domain served at the root
// (not a github.io/reponame/ subpath).
export default defineConfig({
  plugins: [react()],
  base: '/',
})
