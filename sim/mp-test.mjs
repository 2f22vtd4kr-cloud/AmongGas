/**
 * Among Gas — Multiplayer Integration Test
 * Connects real @colyseus/sdk clients to the live server on port 5001.
 *
 * Tests:
 *   A  Lobby join/leave (2 clients)
 *   B  Crew win via task completion (4 / 8 / 15 players)
 *   C  Impostor win via kills (4 players — 2 kills, 15 s cooldown between)
 *   D  Emergency meeting → all-skip vote → game resumes (6 players)
 *   E  Speed-cheat detection (POSITION_CORRECTION for instant teleport)
 *
 * Run: node sim/mp-test.mjs
 */
import { Client } from '@colyseus/sdk';

// ─── Constants (mirror server) ────────────────────────────────────────────────
const SERVER       = 'ws://localhost:5001';
const SPAWN        = { x: 4528, y: 1712 };
const SPEED_MAX    = 400 * 1.3;      // px/s — server tolerance (520)
const KILL_COOLDOWN_MS = 15_500;     // server = 15 000, +500 ms buffer

const TASKS = [
  { id: 'task_0', name: 'fix_wiring',      x: 2191, y: 1672 },
  { id: 'task_1', name: 'stabilize_nav',   x: 5390, y: 1166 },
  { id: 'task_2', name: 'reboot_wifi',     x: 2256, y: 1690 },
  { id: 'task_3', name: 'fuel_engine',     x: 1169, y: 2179 },
  { id: 'task_4', name: 'start_reactor',   x:  909, y: 1023 },
  { id: 'task_5', name: 'align_engine',    x: 2496, y: 1735 },
  { id: 'task_6', name: 'empty_garbage',   x: 3884, y: 2484 },
  { id: 'task_7', name: 'clear_asteroids', x: 3092, y:  418 },
];
const PALETTE = ['Red','Blue','Green','Orange','Yellow',
                 'Black','Brown','Pink','Purple','White',
                 'Red','Blue','Green','Orange','Yellow'];

const wait = ms => new Promise(r => setTimeout(r, ms));
const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

// ─── Per-client message tracker ───────────────────────────────────────────────
function makeTracker(room) {
  const queues  = {};
  const pending = {};
  const TYPES   = [
    'YOU_ARE_IMPOSTOR', 'YOU_ARE_CREW',
    'KILL_CONFIRMED', 'MEETING_STARTED', 'VOTE_RESULT',
    'GAME_OVER', 'POSITION_CORRECTION', 'ERROR', 'CHAT_MESSAGE',
  ];
  for (const t of TYPES) {
    queues[t]  = [];
    pending[t] = [];
    room.onMessage(t, msg => {
      const m = msg ?? {};
      if (pending[t].length > 0) { pending[t].shift()(m); return; }
      queues[t].push(m);
    });
  }
  function waitFor(type, ms = 5000) {
    if (queues[type]?.length > 0) return Promise.resolve(queues[type].shift());
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        pending[type] = pending[type].filter(h => h !== handler);
        rej(new Error(`Timeout (${ms}ms) waiting for '${type}'`));
      }, ms);
      const handler = m => { clearTimeout(timer); res(m); };
      pending[type].push(handler);
    });
  }
  return { waitFor, queues };
}

// ─── Test client ──────────────────────────────────────────────────────────────
class TC {
  constructor(idx) {
    this.sdk        = new Client(SERVER);
    this.name       = `P${idx + 1}`;
    this.color      = PALETTE[idx];
    this.room       = null;
    this.tracker    = null;
    this.isImpostor = null;
    this.x          = SPAWN.x;
    this.y          = SPAWN.y;
    this._lastMoveAt = 0;  // set in _setup() to approximate server's lastPositions.t
  }

  async create() {
    this.room = await this.sdk.create('among_gas', {
      playerName: this.name, color: this.color, initData: '',
    });
    this._setup();
    return this;
  }

  async join(roomId) {
    this.room = await this.sdk.joinById(roomId, {
      playerName: this.name, color: this.color, initData: '',
    });
    this._setup();
    return this;
  }

  _setup() {
    this._lastMoveAt = Date.now(); // mirrors server's initial lastPositions timestamp
    this.tracker = makeTracker(this.room);
    // Track role assignment — the Promise resolves once; .catch swallows the 60 s timeout
    this.tracker.waitFor('YOU_ARE_IMPOSTOR', 60_000)
      .then(() => { this.isImpostor = true;  }).catch(() => {});
    this.tracker.waitFor('YOU_ARE_CREW',     60_000)
      .then(() => { this.isImpostor = false; }).catch(() => {});
  }

  waitFor(type, ms) { return this.tracker.waitFor(type, ms); }
  send(type, msg = {}) { this.room.send(type, msg); }
  get sessionId() { return this.room.sessionId; }

  /**
   * Move to (tx, ty) in a single MOVE message.
   *
   * Waits long enough that the server's speed-validation formula
   *   maxMove = SPEED_MAX × elapsed_s + 50
   * exceeds the distance, with a 2 s safety buffer on top.
   * No timer-jitter risk: the buffer dwarfs any realistic scheduling variance.
   */
  async moveTo(tx, ty) {
    const d = dist(this.x, this.y, tx, ty);
    if (d < 1) return;

    // Minimum real-time that must have elapsed since last MOVE:
    //   d ≤ SPEED_MAX × elapsed_s + 50  →  elapsed_s ≥ (d − 50) / SPEED_MAX
    const minElapsedMs = Math.max(0, ((d - 50) / SPEED_MAX) * 1000);
    const neededMs     = minElapsedMs + 2000;   // 2 s safety buffer
    const elapsed      = Date.now() - this._lastMoveAt;
    if (elapsed < neededMs) await wait(neededMs - elapsed);

    this.send('MOVE', { x: Math.round(tx), y: Math.round(ty),
                        anim: `${this.color.toLowerCase()}_down_1` });
    this.x = Math.round(tx);
    this.y = Math.round(ty);
    this._lastMoveAt = Date.now();
  }

  leave() { try { this.room?.leave(); } catch {} }
}

// ─── Assertions ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✅  ${label}${detail ? `  (${detail})` : ''}`);
    passed++;
  } else {
    const msg = `${label}${detail ? `: ${detail}` : ''}`;
    console.log(`  ❌  ${msg}`);
    failed++;
    failures.push(msg);
  }
}

async function tryCheck(label, fn) {
  try {
    await fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (e) {
    console.log(`  ❌  ${label}: ${e.message}`);
    failed++;
    failures.push(`${label}: ${e.message}`);
  }
}

// ─── Helper: connect N clients and start a game ───────────────────────────────
async function startGame(n) {
  const clients = Array.from({ length: n }, (_, i) => new TC(i));
  await clients[0].create();
  const roomId = clients[0].room.roomId;
  await Promise.all(clients.slice(1).map(c => c.join(roomId)));
  await wait(400);
  clients[0].send('START_GAME', {});
  await wait(3000);  // let role messages arrive and .then() callbacks settle
  return clients;
}

// ─── Test A: Lobby join and leave ─────────────────────────────────────────────
async function testLobbyLeave() {
  console.log('\n── Test A: Lobby join/leave ─────────────────────────────────');
  const c0 = new TC(0);
  await c0.create();
  const c1 = new TC(1);
  await c1.join(c0.room.roomId);
  await wait(400);

  check('2 players registered after join',
    (c0.room.state.players?.size ?? 0) === 2,
    `got ${c0.room.state.players?.size ?? 0}`);

  c1.leave();
  await wait(700);

  check('1 player remains after partner leaves',
    (c0.room.state.players?.size ?? 0) === 1,
    `got ${c0.room.state.players?.size ?? 0}`);

  c0.leave();
  await wait(400);
}

// ─── Test B: Crew win via task completion ────────────────────────────────────
async function testCrewWin(n) {
  console.log(`\n── Test B: Crew-win  (${n} players) ────────────────────────`);
  const clients = Array.from({ length: n }, (_, i) => new TC(i));

  await tryCheck('Host creates room', () => clients[0].create());
  const roomId = clients[0].room.roomId;
  check('Room ID assigned', !!roomId);

  await tryCheck(`${n - 1} clients join`, () =>
    Promise.all(clients.slice(1).map(c => c.join(roomId))));
  await wait(400);

  const sz = clients[0].room.state.players?.size ?? 0;
  check(`All ${n} players in room state`, sz === n, `got ${sz}`);

  // Start game + subscribe to GAME_OVER before tasks begin
  const gameOverPs = clients.map(c => c.waitFor('GAME_OVER', 90_000));
  clients[0].send('START_GAME', {});
  await wait(3000);

  const imps = clients.filter(c => c.isImpostor === true);
  const crew = clients.filter(c => c.isImpostor === false);
  check('Exactly 1 impostor assigned',    imps.length === 1,     `got ${imps.length}`);
  check(`${n - 1} crew assigned`,         crew.length === n - 1, `got ${crew.length}`);
  check('Phase is GAME',
    clients[0].room.state.phase === 'GAME',
    `got '${clients[0].room.state.phase}'`);

  // Small-move sanity check (no POSITION_CORRECTION expected for ±5 px)
  for (const c of clients) {
    c.send('MOVE', { x: c.x + 5, y: c.y, anim: 'red_down_1' });
    c.x += 5;
    c._lastMoveAt = Date.now();
  }
  await wait(600);
  const corrBefore = clients.reduce(
    (s, c) => s + (c.tracker.queues['POSITION_CORRECTION']?.length ?? 0), 0);
  check('No POSITION_CORRECTION for small moves', corrBefore === 0, `got ${corrBefore}`);

  // Assign tasks round-robin per crew client; each client's chain runs sequentially;
  // all chains run in parallel.
  const taskQueues = Array.from({ length: crew.length }, () => []);
  TASKS.forEach((t, i) => taskQueues[i % crew.length].push(t));

  const taskErrors = [];
  await Promise.all(crew.map(async (cc, ci) => {
    for (const task of taskQueues[ci]) {
      await cc.moveTo(task.x, task.y);
      await wait(400);  // ensure MOVE is processed by server before TASK_DONE
      cc.send('TASK_DONE', { taskId: task.id });
      await wait(200);
    }
  })).catch(e => taskErrors.push(e.message));

  check('Task completion loop finished without error',
    taskErrors.length === 0, taskErrors.join('; '));

  // Check for unexpected corrections during movement
  const corrAfter = clients.reduce(
    (s, c) => s + (c.tracker.queues['POSITION_CORRECTION']?.length ?? 0), 0);
  check('No POSITION_CORRECTION during task moves', corrAfter === 0, `got ${corrAfter}`);

  await tryCheck('All clients receive GAME_OVER', () => Promise.all(gameOverPs));

  const go = await gameOverPs[0].catch(() => null);
  check('Winner is crew',    go?.winner === 'crew',   `got '${go?.winner}'`);
  check('impostorId revealed', !!go?.impostorId,      go?.impostorId?.slice(0, 8));
  check('Phase is RESULT',
    clients[0].room.state.phase === 'RESULT',
    `got '${clients[0].room.state.phase}'`);
  const td = clients[0].room.state.tasksDone;
  check('tasksDone === 8', td === 8, `got ${td}`);

  clients.forEach(c => c.leave());
  await wait(600);
}

// ─── Test C: Impostor win via kills ──────────────────────────────────────────
async function testImpostorWin(n) {
  console.log(`\n── Test C: Impostor-win  (${n} players) ────────────────────`);
  // With n players: 1 imp + (n-1) crew.  Imp wins when 1 >= aliveCrew → kill n-2 crew.
  const killsNeeded = n - 2;
  console.log(`  ℹ️  ${killsNeeded} kill(s) needed (${n} players)`);

  const clients = await startGame(n);
  const imp  = clients.find(c => c.isImpostor === true);
  const crew = clients.filter(c => c.isImpostor === false);

  if (!imp) {
    console.log('  ⚠️  Impostor not identified — skipping');
    clients.forEach(c => c.leave()); return;
  }
  check('Impostor identified', true, imp.name);

  const gameOverPs = clients.map(c => c.waitFor('GAME_OVER', 120_000));

  for (let ki = 0; ki < killsNeeded; ki++) {
    const victim = crew[ki];
    // Move victim to a rally point, then move impostor on top
    const rally = { x: 2000 + ki * 150, y: 1600 };
    await victim.moveTo(rally.x, rally.y);
    await wait(300);
    await imp.moveTo(rally.x, rally.y);
    await wait(300);

    const killPs = clients.map(c => c.waitFor('KILL_CONFIRMED', 5000));
    imp.send('KILL', { targetId: victim.sessionId });

    const results = await Promise.allSettled(killPs);
    const allGot  = results.every(r => r.status === 'fulfilled');
    const kc      = allGot ? results[0].value : null;
    check(
      `Kill ${ki + 1}/${killsNeeded}: all ${n} clients receive KILL_CONFIRMED`,
      allGot,
      allGot
        ? `killer=${kc?.killerId?.slice(0,6)} victim=${kc?.victimId?.slice(0,6)}`
        : `${results.filter(r => r.status === 'rejected').length} clients timed out`,
    );

    // Schema-state patch arrives in a separate frame after the message — give it time
    await wait(400);
    const vState = clients[0].room.state.players?.get(victim.sessionId);
    check(`Victim ${victim.name} marked dead in state`, vState?.isAlive === false,
          `isAlive=${vState?.isAlive}`);

    if (ki < killsNeeded - 1) {
      process.stdout.write(`  ⏳  kill cooldown`);
      for (let t = 0; t < 16; t++) { await wait(1000); process.stdout.write('.'); }
      console.log();
    }
  }

  await tryCheck('All clients receive GAME_OVER (impostor)', () =>
    Promise.all(gameOverPs));
  const go = await gameOverPs[0].catch(() => null);
  check('Winner is impostor',  go?.winner === 'impostor', `got '${go?.winner}'`);
  check('impostorId correct',  go?.impostorId === imp.sessionId,
        `expected ${imp.sessionId.slice(0,8)}, got ${go?.impostorId?.slice(0,8)}`);

  clients.forEach(c => c.leave());
  await wait(600);
}

// ─── Test D: Emergency meeting flow ──────────────────────────────────────────
async function testMeeting(n) {
  console.log(`\n── Test D: Meeting flow  (${n} players) ────────────────────`);
  const clients = await startGame(n);
  const crew    = clients.filter(c => c.isImpostor === false);
  if (!crew.length) {
    console.log('  ⚠️  No crew — skipping');
    clients.forEach(c => c.leave()); return;
  }

  // Trigger emergency
  const meetPs = clients.map(c => c.waitFor('MEETING_STARTED', 6000));
  crew[0].send('EMERGENCY', {});
  await tryCheck('All clients receive MEETING_STARTED', () => Promise.all(meetPs));
  const ms = await meetPs[0].catch(() => null);
  check('reason = emergency',  ms?.reason === 'emergency',  ms?.reason);
  check('callerId present',    !!ms?.callerId,               ms?.callerId?.slice(0,8));
  // Schema patch arrives in a separate frame after the broadcast message
  await wait(400);
  check('Phase is MEETING',
    clients[0].room.state.phase === 'MEETING',
    `got '${clients[0].room.state.phase}'`);

  // All alive clients vote skip
  await wait(200);
  const votePs = clients.map(c => c.waitFor('VOTE_RESULT', 12_000));
  for (const c of clients) c.send('VOTE', { targetId: 'skip' });
  await tryCheck('All clients receive VOTE_RESULT', () => Promise.all(votePs));
  const vr = await votePs[0].catch(() => null);
  check('No ejection on all-skip',  vr?.ejectedId === null,  `ejectedId=${vr?.ejectedId}`);
  await wait(300);
  check('Phase returns to GAME',
    clients[0].room.state.phase === 'GAME',
    `got '${clients[0].room.state.phase}'`);

  // Second EMERGENCY from same caller must be rejected
  const errP = crew[0].waitFor('ERROR', 3000);
  crew[0].send('EMERGENCY', {});
  await tryCheck('Duplicate EMERGENCY rejected', () => errP);
  const err = await errP.catch(() => null);
  check('Error code is EMERGENCY_USED', err?.code === 'EMERGENCY_USED', err?.code);

  // Finish the game: complete all tasks so we leave cleanly
  const goPs = clients.map(c => c.waitFor('GAME_OVER', 90_000));
  const tqs  = Array.from({ length: crew.length }, () => []);
  TASKS.forEach((t, i) => tqs[i % crew.length].push(t));
  await Promise.all(crew.map(async (cc, ci) => {
    for (const t of tqs[ci]) {
      await cc.moveTo(t.x, t.y);
      await wait(400);
      cc.send('TASK_DONE', { taskId: t.id });
      await wait(200);
    }
  }));
  await tryCheck('GAME_OVER after tasks complete', () => Promise.all(goPs));

  clients.forEach(c => c.leave());
  await wait(600);
}

// ─── Test F: In-meeting chat ──────────────────────────────────────────────────
async function testChat(n) {
  console.log(`\n── Test F: In-meeting chat  (${n} players) ─────────────────`);
  const clients = await startGame(n);
  const crew    = clients.filter(c => c.isImpostor === false);
  const imp     = clients.find(c => c.isImpostor === true);
  if (!crew.length || !imp) {
    console.log('  ⚠️  Missing roles — skipping');
    clients.forEach(c => c.leave()); return;
  }

  // Chat sent before any meeting must be ignored (no CHAT_MESSAGE to anyone)
  const preP = clients.map(c => c.waitFor('CHAT_MESSAGE', 1500));
  crew[0].send('CHAT_SEND', { text: 'too early' });
  const preResults = await Promise.allSettled(preP);
  check('Chat outside a meeting is dropped',
    preResults.every(r => r.status === 'rejected'),
    `${preResults.filter(r => r.status === 'fulfilled').length} clients received it`);

  const meetPs = clients.map(c => c.waitFor('MEETING_STARTED', 6000));
  crew[0].send('EMERGENCY', {});
  await tryCheck('All clients receive MEETING_STARTED', () => Promise.all(meetPs));
  await wait(300);

  // Normal message reaches every client, from crew and from the impostor
  for (const [sender, text] of [[crew[0], 'it wasn' + "'" + 't me'], [imp, 'sus on P2']]) {
    const chatPs = clients.map(c => c.waitFor('CHAT_MESSAGE', 3000));
    sender.send('CHAT_SEND', { text });
    const results = await Promise.allSettled(chatPs);
    const allGot  = results.every(r => r.status === 'fulfilled');
    check(`All ${n} clients receive chat from ${sender.name}`, allGot,
      allGot ? '' : `${results.filter(r => r.status === 'rejected').length} timed out`);
    if (allGot) {
      const m = results[0].value;
      check('Message text matches',    m.text === text,             `got '${m.text}'`);
      check('senderId matches sender', m.senderId === sender.sessionId);
      check('sender name included',    m.name === sender.name,      m.name);
    }
    await wait(600); // clear the server's per-sender rate-limit window
  }

  // Rate limiting: two rapid messages from the same sender — second is rejected
  const errP  = crew[0].waitFor('ERROR', 2000);
  const echoP = clients.map(c => c.waitFor('CHAT_MESSAGE', 2000));
  crew[0].send('CHAT_SEND', { text: 'first' });
  crew[0].send('CHAT_SEND', { text: 'second-too-fast' });
  await tryCheck('Rapid second message rejected with CHAT_RATE_LIMIT', async () => {
    const err = await errP;
    if (err?.code !== 'CHAT_RATE_LIMIT') throw new Error(`got code '${err?.code}'`);
  });
  await Promise.allSettled(echoP);
  await wait(600);

  // Oversized text is truncated server-side, not rejected
  const longText = 'x'.repeat(400);
  const longPs = clients.map(c => c.waitFor('CHAT_MESSAGE', 3000));
  crew[0].send('CHAT_SEND', { text: longText });
  const longResults = await Promise.allSettled(longPs);
  const longMsg = longResults[0].status === 'fulfilled' ? longResults[0].value : null;
  check('Oversized message truncated to 200 chars',
    longMsg?.text?.length === 200, `got length ${longMsg?.text?.length}`);

  // End the meeting so the game can finish cleanly
  const votePs = clients.map(c => c.waitFor('VOTE_RESULT', 12_000));
  for (const c of clients) c.send('VOTE', { targetId: 'skip' });
  await tryCheck('All clients receive VOTE_RESULT', () => Promise.all(votePs));
  await wait(400);

  // Dead players cannot chat — kill one crew member, then have them try to send
  if (crew.length > 1) {
    const victim = crew[1] ?? crew[0];
    const rally  = { x: 2200, y: 1600 };
    await victim.moveTo(rally.x, rally.y);
    await wait(300);
    await imp.moveTo(rally.x, rally.y);
    await wait(300);
    const killPs = clients.map(c => c.waitFor('KILL_CONFIRMED', 5000));
    imp.send('KILL', { targetId: victim.sessionId });
    await Promise.allSettled(killPs);
    await wait(400);

    const meetPs2 = clients.map(c => c.waitFor('MEETING_STARTED', 6000));
    crew[0].send('REPORT', { corpseId: victim.sessionId });
    await tryCheck('Report triggers a new meeting', () => Promise.all(meetPs2));
    await wait(300);

    const ghostChatPs = clients.map(c => c.waitFor('CHAT_MESSAGE', 1500));
    victim.send('CHAT_SEND', { text: 'ghost speaking' });
    const ghostResults = await Promise.allSettled(ghostChatPs);
    check('Dead player chat is dropped',
      ghostResults.every(r => r.status === 'rejected'),
      `${ghostResults.filter(r => r.status === 'fulfilled').length} clients received it`);

    const votePs2 = clients.map(c => c.waitFor('VOTE_RESULT', 12_000));
    for (const c of clients) if (c !== victim) c.send('VOTE', { targetId: 'skip' });
    await tryCheck('Meeting resolves after ghost-chat check', () => Promise.all(votePs2));
  }

  clients.forEach(c => c.leave());
  await wait(600);
}

// ─── Test E: Speed-cheat detection ───────────────────────────────────────────
async function testSpeedCheat() {
  console.log('\n── Test E: Speed-cheat detection ────────────────────────────');
  const clients = await startGame(2);
  const c0 = clients[0];

  // Send MOVE that jumps the full map width instantly — should trigger correction
  const corrP = c0.waitFor('POSITION_CORRECTION', 4000);
  c0.send('MOVE', { x: c0.x + 10_000, y: c0.y, anim: 'red_down_1' });

  await tryCheck('POSITION_CORRECTION received for teleport', () => corrP);
  const pc = await corrP.catch(() => null);
  check('Corrected x is within world bounds', (pc?.x ?? 99999) <= 5800,
        `x=${pc?.x}`);

  clients.forEach(c => c.leave());
  await wait(600);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const t0 = Date.now();
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   Among Gas — Multiplayer Integration Test                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

await testLobbyLeave();
for (const n of [4, 8, 15]) await testCrewWin(n);
await testImpostorWin(4);    // 2 kills × ~16 s each
await testMeeting(6);
await testChat(6);
await testSpeedCheat();

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed  (${elapsed}s)`);
if (failures.length) {
  console.log('\n  Failed checks:');
  failures.forEach(f => console.log(`    • ${f}`));
}
console.log('══════════════════════════════════════════════════════════════\n');
process.exit(failed > 0 ? 1 : 0);
