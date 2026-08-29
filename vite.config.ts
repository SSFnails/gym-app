import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        id: 'gym-app',
        name: 'Тренировки',
        short_name: 'Зал',
        description: 'Личный дневник тренировок и питания. Работает офлайн.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0A0C0F',
        theme_color: '#0A0C0F',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // webp обязателен: картинки упражнений в нём, а без предзагрузки
        // они бы не открылись в зале без сети.
        globPatterns: ['**/*.{js,css,html,png,jpg,webp,svg,woff2}'],
        navigateFallback: 'index.html',
        // Служебные страницы (снимки, отладка) не должны подменяться приложением.
        navigateFallbackDenylist: [/^\/__/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
