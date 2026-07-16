/**
 * Among Gas — automated screenshot tour
 * Navigates through: Menu → Freeplay → Gameplay (walks around, opens task, meeting)
 * Usage: node sim/screenshot-tour.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5000';
const OUT_DIR  = 'screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

let idx = 1;
async function snap(page, name) {
  const file = path.join(OUT_DIR, `${String(idx).padStart(2,'0')}_${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`📸  ${file}`);
  idx++;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForPhaser(page) {
  // Wait until Phaser has booted (canvas is non-blank)
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    if (!c) return false;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const d = ctx.getImageData(0,0,1,1).data;
    return d[3] > 0; // alpha > 0 means something rendered
  }, { timeout: 20000 });
}

// Click a canvas pixel at (x,y) in the game's *design* coordinate space.
// The canvas is centred and letterboxed; we compute the CSS offset ourselves.
async function clickGame(page, gx, gy) {
  const box = await page.$eval('canvas', c => ({
    left: c.getBoundingClientRect().left,
    top:  c.getBoundingClientRect().top,
    w:    c.getBoundingClientRect().width,
    h:    c.getBoundingClientRect().height,
    cw:   c.width,   // design width  (750)
    ch:   c.height,  // design height (1334)
  }));
  const scaleX = box.w / box.cw;
  const scaleY = box.h / box.ch;
  const cx = box.left + gx * scaleX;
  const cy = box.top  + gy * scaleY;
  await page.mouse.click(cx, cy);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 750, height: 1334 });

  // ── 1. Main menu ──────────────────────────────────────────────────────────
  console.log('Loading game…');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForPhaser(page);
  await sleep(1500);          // let menu music / animations settle
  await snap(page, 'menu');

  // ── 2. Character select (click FREEPLAY) ──────────────────────────────────
  console.log('Clicking FREEPLAY…');
  await clickGame(page, 375, 258);   // FREEPLAY button centre (design coords)
  await sleep(2000);
  await snap(page, 'character_select');

  // ── 3. Choose a colour — click the first swatch (approx top-left of grid) –
  await clickGame(page, 200, 700);
  await sleep(500);
  // Start game — look for a "PLAY" / "START" button around the bottom
  await clickGame(page, 375, 1200);
  await sleep(4000);  // GamePreloadScene loads all assets
  await snap(page, 'loading');

  // Wait for GameScene (loading bar disappears)
  await sleep(6000);
  await snap(page, 'gameplay_spawn');

  // ── 4. Walk around ────────────────────────────────────────────────────────
  console.log('Walking around…');
  await page.keyboard.down('ArrowRight');
  await sleep(1200);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await sleep(1000);
  await page.keyboard.up('ArrowDown');
  await snap(page, 'gameplay_walking');

  // ── 5. Keep walking, let bots appear ─────────────────────────────────────
  await page.keyboard.down('ArrowLeft');
  await sleep(1500);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  await sleep(800);
  await page.keyboard.up('ArrowUp');
  await snap(page, 'gameplay_exploring');

  // ── 6. Open minimap ───────────────────────────────────────────────────────
  await page.keyboard.press('m');
  await sleep(500);
  await snap(page, 'minimap_open');
  await page.keyboard.press('m');   // close again
  await sleep(300);

  // ── 7. Try to interact with a nearby task (E key) ─────────────────────────
  // Walk toward cafeteria task area
  await page.keyboard.down('ArrowRight');
  await sleep(2000);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('e');
  await sleep(1500);
  await snap(page, 'task_or_nearby');

  // ── 8. Press E again in case a task opened — or Escape to close ───────────
  await page.keyboard.press('Escape');
  await sleep(500);
  await page.keyboard.press('e');
  await sleep(2000);
  await snap(page, 'task_scene');
  await page.keyboard.press('Escape');
  await sleep(800);

  // ── 9. Hit emergency meeting button (top-left HUD, design ≈ 60,80) ────────
  console.log('Triggering emergency meeting…');
  // Walk back toward the cafeteria table (emergency button)
  await page.keyboard.down('ArrowLeft');
  await sleep(1200);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('e');   // interact = call meeting if near table
  await sleep(2000);
  await snap(page, 'meeting_or_game');

  // ── 10. Final wide gameplay shot ──────────────────────────────────────────
  await sleep(3000);
  await snap(page, 'final_state');

  await browser.close();
  console.log('\nDone! Screenshots saved to', OUT_DIR);
})();
