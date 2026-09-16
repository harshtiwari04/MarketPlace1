import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy so cookies stay same-origin during local development.
export default defineConfig(({ mode }) => {
  // Third arg '' loads all vars (not just VITE_-prefixed) so VITE_PROXY_TARGET is available here.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api/v1': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'] },
        },
      },
    },
  };
});
