import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed as a GitHub Pages project site: https://amsh7.github.io/md-portal/
export default defineConfig({
  plugins: [react()],
  base: '/md-portal/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
});
