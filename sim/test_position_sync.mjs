/**
 * Manual integration check for Phase 2 (Position Sync): connects two headless
 * Colyseus clients to the running AmongGasRoom, starts a game, has client A
 * send MOVE messages, and asserts client B's `state.players` reflects the
 * new x/y/anim exactly as GameScene's initMultiplayer()/RemotePlayer would
 * consume them.
 *
 * Run: node sim/test_position_sync.mjs   (Colyseus server workflow must be running)
 */
import { Client, getStateCallbacks } from '@colyseus/sdk';

const URL = 'ws://localhost:5001';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const clientA = new Client(URL);
  const clientB = new Client(URL);

  const roomA = await clientA.create('among_gas', { playerName: 'Alice', color: 'Blue', initData: '' });
  console.log('[A] created room', roomA.roomId, 'sessionId', roomA.sessionId);

  const roomB = await clientB.joinById(roomA.roomId, { playerName: 'Bob', color: 'Green', initData: '' });
  console.log('[B] joined room, sessionId', roomB.sessionId);

  await wait(300); // let state sync settle

  const $B = getStateCallbacks(roomB);
  let sawAliceOnB = false;
  let lastSeen = null;
  $B(roomB.state).players.onAdd((player, sessionId) => {
    if (sessionId === roomA.sessionId) {
      sawAliceOnB = true;
      $B(player).onChange(() => {
        lastSeen = { x: player.x, y: player.y, anim: player.anim };
      });
    }
  }, true);

  if (!sawAliceOnB) throw new Error('FAIL: client B never saw client A in state.players');
  console.log('[B] sees Alice in players map — OK');

  roomA.send('START_GAME', {});
  await wait(400);

  const phase = roomB.state.phase;
  console.log('[B] phase after START_GAME:', phase);
  if (phase !== 'GAME') throw new Error(`FAIL: expected phase GAME, got ${phase}`);

  // Simulate GameScene.sendPositionUpdate() from client A — a small, plausible
  // step from spawn (server anti-cheat rejects large jumps, tested below).
  const SPAWN_X = 4528, SPAWN_Y = 1712;
  const targetX = SPAWN_X + 150, targetY = SPAWN_Y - 80, anim = 'blue_left_4';
  roomA.send('MOVE', { x: targetX, y: targetY, anim });
  await wait(300);

  if (!lastSeen) throw new Error('FAIL: client B never received an onChange for Alice');
  console.log('[B] observed Alice state:', lastSeen);

  if (lastSeen.x !== targetX || lastSeen.y !== targetY || lastSeen.anim !== anim) {
    throw new Error(`FAIL: mismatch — expected ${JSON.stringify({ x: targetX, y: targetY, anim })}, got ${JSON.stringify(lastSeen)}`);
  }
  console.log('PASS: position + anim synced correctly to the other client.');

  // Anti-cheat: an implausible teleport should be rejected and corrected.
  let corrected = null;
  roomA.onMessage('POSITION_CORRECTION', (msg) => { corrected = msg; });
  roomA.send('MOVE', { x: 100, y: 100, anim: 'blue_down_1' }); // huge jump from (3000,1200)
  await wait(300);
  if (!corrected) throw new Error('FAIL: server did not reject an implausible teleport');
  console.log('PASS: server rejected teleport and sent POSITION_CORRECTION', corrected);

  roomA.leave();
  roomB.leave();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
