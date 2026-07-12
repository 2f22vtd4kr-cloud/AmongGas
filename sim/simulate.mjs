/**
 * Headless game simulation — 10 parallel workers, runs until killed.
 * Models: bot random-walk, impostor AI kills (including player), task
 * completion, meetings with correct tie→skip logic, win/lose conditions.
 *
 * Run: node sim/simulate.mjs
 */
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

// ─── Constants (mirrors src/settings.ts) ─────────────────────────────────────
const WORLD_W        = 5792;
const WORLD_H        = 3168;
const PLAYER_SPEED   = 400;
const BOT_SPEED      = PLAYER_SPEED * 0.55;  // 220 u/s
const NO_OF_MISSIONS = 8;
const KILL_RADIUS_AI = 300;
const INTERACT_RADIUS = 120;
const KILL_INTERVAL  = 8000;   // ms between impostor kill attempts
const DT             = 16;     // ms per sim tick (~60 fps)
const MAX_SIM_MS     = 15 * 60 * 1000; // hard cap per game: 15 min simulated

const BOT_POS = [
  { x: 5401, y: 1530 }, { x: 3686, y: 1857 }, { x: 3733, y: 2626 },
  { x: 2325, y: 1814 }, { x: 1718, y: 1282 }, { x: 1288, y: 2418 },
  { x: 1249, y:  506 }, { x: 2513, y: 1286 },
];
const PLAYER_SPAWN = { x: 4528, y: 1712 };

// Real task centres parsed from TMX
const TASK_OBJECTS = [
  { name: 'electricity_wires', type: 'fix_wiring',      cx: 2191, cy: 1672 },
  { name: 'nav',               type: 'stabilize_nav',   cx: 5390, cy: 1166 },
  { name: 'wifi',              type: 'reboot_wifi',     cx: 2256, cy: 1690 },
  { name: 'engines',           type: 'fuel_engine',     cx: 1169, cy: 2179 },
  { name: 'reactor_btn',       type: 'start_reactor',   cx:  909, cy: 1023 },
  { name: 'generator_circuit', type: 'align_engine',    cx: 2496, cy: 1735 },
  { name: 'garbage_liver',     type: 'empty_garbage',   cx: 3884, cy: 2484 },
  { name: 'laptop',            type: 'clear_asteroids', cx: 3092, cy:  418 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function rng(lo, hi) { return lo + Math.random() * (hi - lo); }
function randDir() {
  const dirs = ['up','down','left','right','down','down'];
  return dirs[Math.floor(Math.random() * dirs.length)];
}

// ─── Single game ─────────────────────────────────────────────────────────────
function runGame(workerId, gameId) {
  const bugs = [];

  // Build tasks (mirrors GameScene.buildTasks + known padding bug)
  const tasks = TASK_OBJECTS.map((o, i) => ({
    id: `task_${i}`, objectName: o.name, type: o.type,
    cx: o.cx, cy: o.cy, completed: false,
  }));
  let padId = tasks.length;
  while (tasks.length < NO_OF_MISSIONS && tasks.length > 0) {
    // Production code: tasks.length % tasks.length === 0 — always clones tasks[0]
    const clone = { ...tasks[0], id: `task_${padId++}`, completed: false };
    tasks.push(clone);
  }
  const activeTasks = tasks.slice(0, NO_OF_MISSIONS);
  const padCount = activeTasks.filter(t => parseInt(t.id.split('_')[1]) >= TASK_OBJECTS.length).length;
  if (padCount > 0) {
    bugs.push(`COSMETIC: ${padCount} padded task(s) duplicated from task_0 (${activeTasks[0].objectName}) — padding loop always clones index 0`);
  }

  // Entities
  const impostorIdx = Math.floor(Math.random() * BOT_POS.length);
  const bots = BOT_POS.map((pos, i) => ({
    id: i, x: pos.x, y: pos.y,
    isImpostor: i === impostorIdx, isAlive: true,
    dir: randDir(), changeTimer: 0, changeInterval: rng(1500, 3500),
  }));
  const player = {
    x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, isAlive: true,
  };

  let tasksDone = 0, gameOver = false, winner = null;
  let elapsed = 0, killTimer = KILL_INTERVAL;
  let meetingCooldown = 30000, meetings = 0;

  // ── Move entity in its current random direction ────────────────────────────
  // taskTarget: pre-assigned task for crew bots (25% seek bias, cycles to next when done)
  // homeTarget: {x,y} to occasionally home toward — used for impostor homing (20% bias)
  function moveEntity(ent, speed, taskTarget, homeTarget) {
    ent.changeTimer += DT;
    if (ent.changeTimer >= ent.changeInterval) {
      ent.changeTimer = 0;
      ent.changeInterval = rng(1500, 3500);

      // If assigned task is done, fall through to the next incomplete task
      const effectiveTask = (taskTarget && !taskTarget.completed)
        ? taskTarget
        : activeTasks.find(t => !t.completed) ?? null;

      if (effectiveTask && Math.random() < 0.25) {
        // Crew bot task-seek: 25% chance each direction change
        const dx = effectiveTask.cx - ent.x, dy = effectiveTask.cy - ent.y;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (adx > ady) ent.dir = dx > 0 ? 'right' : 'left';
        else           ent.dir = dy > 0 ? 'down'  : 'up';
      } else if (homeTarget && Math.random() < 0.20) {
        // Impostor homing: 20% chance to step toward nearest prey
        const dx = homeTarget.x - ent.x, dy = homeTarget.y - ent.y;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (adx > ady) ent.dir = dx > 0 ? 'right' : 'left';
        else           ent.dir = dy > 0 ? 'down'  : 'up';
      } else {
        ent.dir = randDir();
      }
    }
    let dx = 0, dy = 0;
    if (ent.dir === 'up')    dy = -1;
    if (ent.dir === 'down')  dy =  1;
    if (ent.dir === 'left')  dx = -1;
    if (ent.dir === 'right') dx =  1;
    const dt_s = DT / 1000;
    ent.x = Math.max(0, Math.min(WORLD_W, ent.x + dx * speed * dt_s));
    ent.y = Math.max(0, Math.min(WORLD_H, ent.y + dy * speed * dt_s));
  }

  // Player AI: walk straight toward nearest incomplete task
  function movePlayer() {
    if (!player.isAlive) return;
    const next = activeTasks.find(t => !t.completed);
    if (!next) return;
    const dx = next.cx - player.x, dy = next.cy - player.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d < 1) return;
    const dt_s = DT / 1000;
    player.x = Math.max(0, Math.min(WORLD_W, player.x + (dx/d) * PLAYER_SPEED * dt_s));
    player.y = Math.max(0, Math.min(WORLD_H, player.y + (dy/d) * PLAYER_SPEED * dt_s));
  }

  // Pre-assign each crew bot to a task so they spread out rather than all clustering
  // 25% of the time each direction-change, a crew bot heads directly toward its target task.
  // This models the loose task-following that happens in real play (map corridors + task prompts).
  const botTaskTarget = bots.map((b, i) =>
    !b.isImpostor ? activeTasks[i % activeTasks.length] : null
  );

  // Task interactions: player or crewmate bots complete tasks on proximity
  function checkTasks() {
    for (const task of activeTasks) {
      if (task.completed) continue;
      if (player.isAlive && dist(player, { x: task.cx, y: task.cy }) < INTERACT_RADIUS) {
        task.completed = true; tasksDone++;
      }
      for (const bot of bots) {
        if (task.completed || !bot.isAlive || bot.isImpostor) continue;
        if (dist(bot, { x: task.cx, y: task.cy }) < INTERACT_RADIUS) {
          task.completed = true; tasksDone++;
        }
      }
    }
  }

  // Impostor AI — now also targets player (Bug #1 fix applied in source)
  function impostorAct() {
    const imp = bots.find(b => b.isImpostor && b.isAlive);
    if (!imp) return;

    let minDist = Infinity, targetBot = null;
    for (const bot of bots) {
      if (!bot.isAlive || bot.isImpostor) continue;
      const d = dist(imp, bot);
      if (d < minDist) { minDist = d; targetBot = bot; }
    }
    const playerDist = player.isAlive ? dist(imp, player) : Infinity;

    if (playerDist < minDist && playerDist < KILL_RADIUS_AI) {
      // Kill player — fixed behaviour
      player.isAlive = false;
    } else if (targetBot && minDist < KILL_RADIUS_AI) {
      targetBot.isAlive = false;
    }
  }

  // Meeting simulation — includes player as vote candidate (id=-1), mirrors MeetingScene logic
  function simulateMeeting() {
    meetings++;
    const aliveBots = bots.filter(b => b.isAlive);
    if (aliveBots.length === 0) return;

    // All alive voters: bot ids + player id (-1 if alive)
    const voterIds = aliveBots.map(b => b.id);
    if (player.isAlive) voterIds.push(-1);

    const tally = new Map();
    for (const vid of voterIds) {
      const others = voterIds.filter(x => x !== vid);
      if (others.length === 0 || Math.random() < 0.15) {
        tally.set('skip', (tally.get('skip') ?? 0) + 1);
      } else {
        const pick = others[Math.floor(Math.random() * others.length)];
        tally.set(pick, (tally.get(pick) ?? 0) + 1);
      }
    }

    let maxVotes = 0, ejected = 'skip', tied = false;
    for (const [k, cnt] of tally) {
      if (cnt > maxVotes) { maxVotes = cnt; ejected = k; tied = false; }
      else if (cnt === maxVotes && k !== 'skip') { tied = true; }
    }
    if (tied) ejected = 'skip'; // ties → no ejection

    if (ejected !== 'skip') {
      if (ejected === -1) {
        player.isAlive = false; // player ejected — mirrors resolveMeeting(ejectedId === -1)
      } else {
        const bot = bots.find(b => b.id === ejected);
        if (bot) bot.isAlive = false;
      }
    }
  }

  // Win conditions (mirrors GameScene.checkWinConditions)
  function checkWin() {
    const aliveCrews = bots.filter(b => b.isAlive && !b.isImpostor).length;
    const aliveImps  = bots.filter(b => b.isAlive &&  b.isImpostor).length;

    if (tasksDone >= NO_OF_MISSIONS)        { winner = 'crew';     gameOver = true; return; }
    if (aliveImps === 0)                    { winner = 'crew';     gameOver = true; return; }
    if (aliveImps >= aliveCrews + (player.isAlive ? 1 : 0)) {
      winner = 'impostor'; gameOver = true;
    }
  }

  // ── Main loop ──────────────────────────────────────────────────────────────
  while (!gameOver && elapsed < MAX_SIM_MS) {
    elapsed += DT;
    movePlayer();
    for (let i = 0; i < bots.length; i++) {
      if (!bots[i].isAlive) continue;
      // Impostor: compute nearest alive prey as home target
      let homeTarget = null;
      if (bots[i].isImpostor) {
        let minD = Infinity;
        for (const b of bots) {
          if (!b.isAlive || b.isImpostor) continue;
          const d = dist(bots[i], b);
          if (d < minD) { minD = d; homeTarget = { x: b.x, y: b.y }; }
        }
        if (player.isAlive) {
          const pd = dist(bots[i], player);
          if (pd < minD) homeTarget = { x: player.x, y: player.y };
        }
      }
      moveEntity(bots[i], BOT_SPEED, botTaskTarget[i], homeTarget);
    }
    checkTasks();
    killTimer -= DT;
    if (killTimer <= 0) { killTimer = KILL_INTERVAL; impostorAct(); }
    meetingCooldown -= DT;
    if (meetingCooldown <= 0 && Math.random() < 0.001) {
      simulateMeeting();
      meetingCooldown = 45000;
    }
    checkWin();
  }

  // ── Post-game checks ───────────────────────────────────────────────────────
  if (!gameOver) {
    const aliveCrewsEnd = bots.filter(b => b.isAlive && !b.isImpostor).length;
    const aliveImpsEnd  = bots.filter(b => b.isAlive &&  b.isImpostor).length;
    bugs.push(
      `HANG: game never ended after ${MAX_SIM_MS/1000}s — ` +
      `tasks=${tasksDone}/${NO_OF_MISSIONS} crew=${aliveCrewsEnd} imp=${aliveImpsEnd} playerAlive=${player.isAlive} meetings=${meetings}`
    );
    winner = 'timeout';
  }
  if (tasksDone > NO_OF_MISSIONS) {
    bugs.push(`OVERCOUNT: tasksDone=${tasksDone} > NO_OF_MISSIONS=${NO_OF_MISSIONS}`);
  }

  return {
    workerId, gameId, winner,
    elapsed: Math.round(elapsed / 1000),
    tasksDone, meetings,
    aliveAtEnd: bots.filter(b => b.isAlive).length,
    playerAlive: player.isAlive,
    bugs,
  };
}

// ─── Worker ───────────────────────────────────────────────────────────────────
if (!isMainThread) {
  const { workerId } = workerData;
  let gameId = 0;
  const stats = { crew: 0, impostor: 0, timeout: 0, games: 0 };
  const seenBugs = new Set();

  while (true) {
    gameId++;
    const r = runGame(workerId, gameId);
    stats.games++;
    stats[r.winner]++;

    for (const b of r.bugs) {
      if (!seenBugs.has(b)) {
        seenBugs.add(b);
        parentPort.postMessage({ type: 'bug', workerId, gameId, bug: b });
      }
    }
    if (stats.games % 100 === 0) {
      parentPort.postMessage({ type: 'stats', workerId, ...stats });
    }
  }
}

// ─── Main thread ──────────────────────────────────────────────────────────────
if (isMainThread) {
  const N = 10;
  const global = { games: 0, crew: 0, impostor: 0, timeout: 0, bugs: new Set() };
  const wStats = {};

  console.log(`\n🎮  Among Gas play-test — ${N} workers  (Ctrl+C to stop)\n`);
  console.log('Bugs printed immediately as found.\n' + '─'.repeat(60));

  for (let i = 0; i < N; i++) {
    wStats[i] = {};
    const w = new Worker(new URL(import.meta.url), { workerData: { workerId: i } });
    w.on('message', msg => {
      if (msg.type === 'bug') {
        if (!global.bugs.has(msg.bug)) {
          global.bugs.add(msg.bug);
          const tag = msg.bug.startsWith('HANG')     ? '🔴 HANG'
                    : msg.bug.startsWith('OVER')     ? '🔴 BUG'
                    : msg.bug.startsWith('COSMETIC') ? '💄 COSMETIC'
                    :                                  '🐛 BUG';
          console.log(`\n${tag} [W${msg.workerId} G${msg.gameId}] ${msg.bug}`);
        }
      } else if (msg.type === 'stats') {
        wStats[msg.workerId] = msg;
        global.games    = Object.values(wStats).reduce((a,s) => a+(s.games??0),    0);
        global.crew     = Object.values(wStats).reduce((a,s) => a+(s.crew??0),     0);
        global.impostor = Object.values(wStats).reduce((a,s) => a+(s.impostor??0), 0);
        global.timeout  = Object.values(wStats).reduce((a,s) => a+(s.timeout??0),  0);
        const cp = global.games ? (global.crew/global.games*100).toFixed(1) : 0;
        const ip = global.games ? (global.impostor/global.games*100).toFixed(1) : 0;
        process.stdout.write(
          `\r📊 games=${global.games}  crew=${global.crew}(${cp}%)  imp=${global.impostor}(${ip}%)  timeout=${global.timeout}  bugs=${global.bugs.size}  `
        );
      }
    });
    w.on('error', e => console.error(`W${i} error:`, e));
  }

  process.stdout.write('\r📊 warming up...\n');
  await new Promise(() => {});
}
