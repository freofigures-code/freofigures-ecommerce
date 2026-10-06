import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { seoPlugin } from './seo/server.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), seoPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': projectRoot,
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(projectRoot, 'index.html'),
          b2b: path.resolve(projectRoot, 'b2b.html'),
          b2bProduto: path.resolve(projectRoot, 'b2b-produto.html'),
          b2bConta: path.resolve(projectRoot, 'b2b-conta.html'),
          criarModelo: path.resolve(projectRoot, 'criar-modelo.html'),
          minhasCriacoes: path.resolve(projectRoot, 'minhas-criacoes.html'),
        },
      },
    },
    server: {
      allowedHosts: ['freofigures.com.br', 'www.freofigures.com.br'],
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: ['freofigures.com.br', 'www.freofigures.com.br'],
    },
  };
});
