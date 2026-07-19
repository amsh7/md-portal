import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed as a GitHub Pages project site: https://amsh7.github.io/md-portal/
export default defineConfig({
  plugins: [react()],
  base: '/md-portal/',
});
