import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
  },
  assetsInclude: ['**/*.tmx', '**/*.TTF'],
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Enable the service worker in dev mode so offline works without a
      // production build.
      devOptions: { enabled: true },
      manifest: {
        name: 'Among Gas',
        short_name: 'Among Gas',
        description: 'Among Us clone — play online or offline',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Precache only built JS / CSS / HTML (fonts come via runtime cache
        // below because they live under Assets/ not in the Vite bundle).
        globPatterns: ['**/*.{js,css,html}'],

        runtimeCaching: [
          // Game images + maps + fonts — cache-first (never change between
          // sessions, ~32 MB total — well within browser quota).
          {
            urlPattern: /\/Assets\/(Images|Maps|Fonts)\/.+/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-assets-v1',
              expiration: {
                maxEntries: 700,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Sounds — network-first so large WAV/MP3 files only get cached
          // after the player has been online once, keeping the initial
          // install quota small.
          {
            urlPattern: /\/Assets\/Sounds\/.+/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'game-sounds-v1',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
