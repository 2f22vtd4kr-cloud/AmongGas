/**
 * Among Gas — Real Gameplay Screenshot Session
 *
 * Boots the game in various autoplay modes and captures screenshots that show
 * actual gameplay: room navigation, task panels, emergency meeting, minimap.
 *
 * Strategy:
 *   • Each "scene" is a fresh page load with a specific ?autoplay=<mode> URL.
 *   • We wait until the canvas center pixel has real brightness (>30 luma),
 *     indicating the game world has rendered and is not just the background.
 *   • Viewport is portrait 750×1334 to match the game's design resolution.
 *
 * Usage: node sim/screenshot-session.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dir, '../screenshots');
const BASE    = 'http://localhost:5000';

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Canvas brightness probe ──────────────────────────────────────────────────
// Samples a grid of pixels (not just centre) so one dark table or wall tile
// doesn't fool us into thinking nothing has rendered.
async function canvasBrightness(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return 0;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const W = c.width, H = c.height;
    if (W < 100 || H < 100) return 0;
    let total = 0, n = 0;
    for (let gy = 0.3; gy <= 0.7; gy += 0.1) {
      for (let gx = 0.3; gx <= 0.7; gx += 0.1) {
        const px = ctx.getImageData(Math.round(gx * W), Math.round(gy * H), 1, 1).data;
        total += (px[0] + px[1] + px[2]) / 3;
        n++;
      }
    }
    return total / n;
  });
}

// Wait until the canvas grid-average brightness exceeds `threshold`.
// Times out after `maxMs`; returns false on timeout (doesn't throw).
async function waitForBrightness(page, threshold = 25, maxMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const b = await canvasBrightness(page);
    if (b >= threshold) return true;
    await sleep(300);
  }
  const final = await canvasBrightness(page);
  console.warn(`  ⚠ timeout waiting for brightness >${threshold} (got ${final.toFixed(1)})`);
  return false;
}

// Read a specific canvas pixel in design coords.
async function canvasPixel(page, gx, gy) {
  return page.evaluate(({ gx, gy }) => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const px = ctx.getImageData(Math.round(gx * c.width), Math.round(gy * c.height), 1, 1).data;
    return { r: px[0], g: px[1], b: px[2], a: px[3] };
  }, { gx, gy });
}

let shotIdx = 1;
async function snap(page, name, note = '') {
  const file = path.join(OUT_DIR, `session_${String(shotIdx).padStart(2, '0')}_${name}.jpg`);
  await page.screenshot({ path: file, fullPage: false });
  const bright = await canvasBrightness(page);
  console.log(`  📸 ${path.basename(file)}  brightness=${bright.toFixed(1)}${note ? '  ' + note : ''}`);
  shotIdx++;
  return file;
}

// Load a page and wait for Phaser's Canvas to render game content.
async function loadScene(page, url, waitMs = 0) {
  console.log(`\n→ Loading ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  // Wait for canvas element to exist
  await page.waitForSelector('canvas', { timeout: 15_000 });
  // Give Phaser a moment to initialise its Canvas renderer
  await sleep(500);
  // If an extra fixed wait is requested (e.g. loading bar)
  if (waitMs > 0) await sleep(waitMs);
}

// ── Click a canvas position in game design coordinates (750×1334 space) ──────
async function clickGame(page, gx, gy) {
  const box = await page.$eval('canvas', c => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, cw: c.width, ch: c.height, w: r.width, h: r.height };
  });
  const scaleX = box.w / box.cw;
  const scaleY = box.h / box.ch;
  await page.mouse.click(box.left + gx * scaleX, box.top + gy * scaleY);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  // Use the system Chromium installed via Nix — the Playwright-bundled headless
  // shell is a dynamically-linked Ubuntu binary that won't run on NixOS without
  // all system libraries in standard paths.  The nix-wrapped chromium binary
  // sets up its own library paths via a shell wrapper, so it works out of the box.
  const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium';
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-gpu', '--single-process'],
  });

  // Portrait viewport matching the game's design resolution
  const context = await browser.newContext({ viewport: { width: 750, height: 1334 } });
  const page    = await context.newPage();

  // Suppress expected 404 noise for missing optional assets
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('404')) return;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SCENE A — Gameplay: Security room walk (fog on, atmospheric look)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n══ SCENE A: Security room gameplay (fog on) ══');
  await loadScene(page, `${BASE}/?autoplay=walk`);

  // GamePreloadScene loads assets (fast mode — ~1-2 s), then GameScene boots.
  // The autoplay teleports the player to Security room and starts the walk.
  const gotContent_A = await waitForBrightness(page, 25, 25_000);
  if (gotContent_A) {
    await sleep(500);  // let the first render frame settle
    await snap(page, 'security_fog_spawn', '(player in Security room, fog on)');

    // Walk to the right — toward Medbay corridor
    await page.keyboard.down('ArrowRight');
    await sleep(1800);
    await page.keyboard.up('ArrowRight');
    await snap(page, 'security_fog_right', '(walked right)');

    // Walk down — into the lower hall
    await page.keyboard.down('ArrowDown');
    await sleep(1200);
    await page.keyboard.up('ArrowDown');
    await snap(page, 'security_fog_down', '(walked down)');

    // Walk left — back through Security
    await page.keyboard.down('ArrowLeft');
    await sleep(1500);
    await page.keyboard.up('ArrowLeft');
    await snap(page, 'security_fog_left', '(walked left)');
  } else {
    await snap(page, 'security_fog_timeout', '(timed out)');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENE B — Gameplay: Security room, fog OFF (shows full map art)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n══ SCENE B: Security room — fog disabled ══');
  await loadScene(page, `${BASE}/?autoplay=walk&debugNoFog`);

  const gotContent_B = await waitForBrightness(page, 25, 25_000);
  if (gotContent_B) {
    await sleep(500);
    await snap(page, 'security_nofog_spawn', '(Security room, fog off)');

    // Probe pixel at game center to log real map color
    const px = await canvasPixel(page, 0.5, 0.5);
    console.log(`    Center pixel: R=${px?.r} G=${px?.g} B=${px?.b}`);

    // Walk a bit to show the player sprite in motion
    await page.keyboard.down('ArrowRight');
    await sleep(1500);
    await page.keyboard.up('ArrowRight');
    await snap(page, 'security_nofog_walking', '(walking right, no fog)');
  } else {
    await snap(page, 'security_nofog_timeout', '(timed out)');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENE C — Task panel: Fix Wiring (Electrical room)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n══ SCENE C: Fix Wiring task panel ══');
  await loadScene(page, `${BASE}/?autoplay=task`);

  // Task mode teleports to wiring task (2191, 1672) and opens the panel.
  // Wait for the task panel to appear — it's brighter than the game world.
  const gotContent_C = await waitForBrightness(page, 20, 25_000);
  if (gotContent_C) {
    await sleep(2000); // let panel animation finish
    await snap(page, 'task_fix_wiring_panel', '(Fix Wiring task open)');

    // Interact with the panel — click a wire
    await clickGame(page, 200, 600);
    await sleep(500);
    await snap(page, 'task_fix_wiring_progress', '(wire selected)');

    // Close with Escape
    await page.keyboard.press('Escape');
    await sleep(600);
    await snap(page, 'task_fix_wiring_closed', '(back to gameplay)');
  } else {
    await snap(page, 'task_timeout', '(timed out)');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENE D — Emergency meeting
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n══ SCENE D: Emergency meeting ══');
  await loadScene(page, `${BASE}/?autoplay=meeting`);

  // Meeting mode: spawns in Security, walks briefly, then opens meeting.
  // Meeting screen is white/bright so brightness check works well.
  const gotContent_D = await waitForBrightness(page, 20, 30_000);
  if (gotContent_D) {
    await sleep(1500); // let meeting initialise
    const bMeeting = await canvasBrightness(page);
    console.log(`    Brightness after wait: ${bMeeting.toFixed(1)}`);

    // Wait up to 15 s for the meeting panel (brighter than gameplay)
    let meetingVisible = false;
    for (let i = 0; i < 30; i++) {
      const b = await canvasBrightness(page);
      if (b > 60) { meetingVisible = true; break; }
      await sleep(500);
    }
    await snap(page, 'meeting_panel', meetingVisible ? '(meeting active)' : '(gameplay — meeting pending)');

    // Vote skip (bottom centre of screen ≈ 375, 1200)
    await clickGame(page, 375, 1200);
    await sleep(800);
    await snap(page, 'meeting_voted', '(vote cast)');

    await sleep(3000); // wait for vote result
    await snap(page, 'meeting_result', '(vote result)');
  } else {
    await snap(page, 'meeting_timeout', '(timed out)');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENE E — Minimap
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n══ SCENE E: Minimap ══');
  await loadScene(page, `${BASE}/?autoplay=minimap`);

  const gotContent_E = await waitForBrightness(page, 20, 25_000);
  if (gotContent_E) {
    await sleep(2000); // minimap mode opens map after 2 s
    await snap(page, 'minimap_open', '(minimap visible)');

    // Close minimap and show gameplay again
    await page.keyboard.press('m');
    await sleep(400);
    await snap(page, 'minimap_closed', '(back to gameplay)');
  } else {
    await snap(page, 'minimap_timeout', '(timed out)');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENE F — Menu screen
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n══ SCENE F: Main menu ══');
  await loadScene(page, BASE);  // load with no autoplay — stays on menu
  await sleep(2000);
  // Wait for menu brightness (Among Us purple menu is darker than gameplay)
  await waitForBrightness(page, 5, 15_000);
  await sleep(500);
  await snap(page, 'main_menu', '(main menu)');

  // ────────────────────────────────────────────────────────────────────────────
  await browser.close();

  console.log(`\n✅  Session complete — ${shotIdx - 1} screenshots saved to ${OUT_DIR}/`);
  console.log('   Files:');
  fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('session_'))
    .sort()
    .forEach(f => console.log(`   • ${f}`));
})();
