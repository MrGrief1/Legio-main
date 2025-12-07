import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  return {
    base: '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env': {
        ...Object.entries(env).reduce((acc, [key, val]) => {
          if (key.startsWith('VITE_')) {
            acc[`import.meta.env.${key}`] = JSON.stringify(val);
          }
          return acc;
        }, {} as Record<string, string>),
        GEMINI_API_KEY: JSON.stringify(env.GEMINI_API_KEY)
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
