import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  envPrefix: ['VITE_', 'SUPABASE_'],
  server: {
    port: 5173,
    strictPort: true,
  },
});
