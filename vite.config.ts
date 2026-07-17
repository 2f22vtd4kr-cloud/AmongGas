import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only plugin: receives the game canvas as a JPEG data-URL via POST
// /dev/screenshot and writes it to screenshots/live_game.jpg so the agent
// can read it as a real file.
// Also serves GET /dev/screenshot as a live-image endpoint (shows the last
// captured frame) and GET /dev/screenshot/wait which long-polls until a new
// frame is posted (used by the relay page so networkidle fires only after the
// game has finished rendering).
let _lastScreenshotBuf: Buffer | null = null;
let _waiters: Array<(buf: Buffer) => void> = [];

const devScreenshotPlugin = {
  name: 'dev-screenshot',
  configureServer(server: any) {

    // Long-poll hold: keeps the browser's network busy for ~10 s so the
    // Screenshot tool's networkidle timer doesn't fire until the game has had
    // time to render frames and POST the canvas capture.
    server.middlewares.use('/dev/ping-hold', (_req: any, res: any) => {
      setTimeout(() => {
        res.setHeader('Content-Type', 'text/plain');
        res.end('ok');
      }, 10_000);
    });

    server.middlewares.use('/dev/screenshot', (req: any, res: any) => {
      // ── POST: game sends canvas data ──────────────────────────────
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c: Buffer) => { body += c.toString(); });
        req.on('end', () => {
          try {
            const { dataUrl } = JSON.parse(body);
            const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
            const buf = Buffer.from(b64, 'base64');
            _lastScreenshotBuf = buf;
            // save to disk
            fs.mkdirSync(path.resolve('screenshots'), { recursive: true });
            fs.writeFileSync(path.resolve('screenshots/live_game.jpg'), buf);
            // resolve any waiting long-poll GETs
            for (const resolve of _waiters) resolve(buf);
            _waiters = [];
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500; res.end(String(e));
          }
        });
        return;
      }

      // ── GET /dev/screenshot/wait: long-poll until next capture ────
      if (req.method === 'GET' && (req.url as string).includes('/wait')) {
        const timeout = setTimeout(() => {
          _waiters = _waiters.filter(r => r !== resolve);
          res.statusCode = 204; res.end();
        }, 30_000);
        const resolve = (buf: Buffer) => {
          clearTimeout(timeout);
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Content-Length', buf.length);
          res.end(buf);
        };
        _waiters.push(resolve);
        return;
      }

      // ── GET /dev/screenshot: serve last captured frame ─────────────
      if (req.method === 'GET') {
        if (!_lastScreenshotBuf) {
          // try disk fallback
          try {
            _lastScreenshotBuf = fs.readFileSync(path.resolve('screenshots/live_game.jpg'));
          } catch (_) {}
        }
        if (_lastScreenshotBuf) {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Content-Length', _lastScreenshotBuf.length);
          res.end(_lastScreenshotBuf);
        } else {
          res.statusCode = 404; res.end('No screenshot yet');
        }
        return;
      }

      res.statusCode = 405; res.end();
    });
  },
};

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
    devScreenshotPlugin,
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
