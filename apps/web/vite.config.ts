import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // A tela e a API na mesma origem: sem CORS, e o navegador fala com uma API só (problema 13).
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
