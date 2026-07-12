# Multiplayer Implementation Strategy — Among Gas
## Telegram Mini App · July 2026

> **Purpose:** Authoritative implementation guide for the next engineering session. Read top-to-bottom before writing any code. All external facts were verified against live documentation and pricing pages as of July 2026.

---

## 0. Project Snapshot

| Item | Value |
|---|---|
| Engine | Phaser 3.90 (Canvas renderer) |
| Language | TypeScript 5, Vite 5 |
| Canvas | Fixed 750 × 1334 portrait, `Scale.FIT + CENTER_BOTH` |
| Telegram SDK | `@twa-dev/sdk` (already bootstrapped in `src/main.ts`) |
| Existing server | `server.py` — raw TCP + `pickle`, LAN only, not usable from browser |
| Reserved port | 5001 (already declared in `.replit`) |
| Single-player | Fully working Freeplay mode — keep it intact |

---

## 1. Architecture Decision

### Comparison Table

| Option | Type | Latency Profile | Cost @ 100 CCU | Setup Complexity | Among Us Fit |
|---|---|---|---|---|---|
| **Colyseus 0.16** | Self-hosted, Node.js | ≤ 30 ms intra-DC | ~$20/mo (Replit Reserved VM) | Medium | ✅ Best fit |
| Raw `ws` / uWebSockets.js | Self-hosted, Node.js | ≤ 20 ms | Same as above | High (manual state diffing) | ⚠️ Viable but more work |
| Hathora | Managed, multi-region | ≤ 50 ms global | ~$0.001/CCU-hr → ~$7/mo | Low | ⚠️ Overkill; good option if global scale matters |
| Cloudflare Durable Objects | Serverless edge | ≤ 50 ms | Expensive at high message rate ($0.15/M messages) | Low-Medium | ❌ Billing model punishes 10 Hz game loops |
| Rivet | Managed game backend | ≤ 40 ms | Closed public beta as of July 2026; pricing not public | High (unknown) | ❌ Not production-ready for new projects |

### Recommendation: Colyseus 0.16 on a Replit Reserved VM

**Why Colyseus:**
- Built-in `@colyseus/schema` provides automatic delta-state serialization — no manual diffing for 10 Hz position updates.
- `Room` lifecycle maps 1:1 to Among Us game phases: `onCreate` → Lobby, `onJoin`/`onLeave`, `onMessage`, `onDispose`.
- `setSimulationInterval` drives the authoritative game tick at exactly 10 Hz.
- TypeScript-native; shares type definitions with the Phaser client without a separate RPC layer.
- v0.16 (current stable as of July 2026) has built-in graceful reconnection support — critical for Telegram WebView which can background the Mini App mid-game.

**Why not the others:**
- *Raw ws:* You'd hand-write room management, matchmaking, reconnection, and delta compression that Colyseus gives for free. Only worthwhile if Colyseus adds unacceptable overhead (it doesn't for this scale).
- *Hathora:* Excellent global latency but adds vendor lock-in and a dependency on their lobby SDK. Among Gas has fixed 4–10 players; global multi-region servers are irrelevant.
- *Cloudflare Durable Objects:* Pricing scales per WebSocket message. At 10 players × 10 Hz × 60 s/min × 10 min avg game = 60,000 messages/game, costs are manageable, but the billing model is unpredictable and the 128 MB RAM limit constrains room state.
- *Rivet:* Not production-ready as of July 2026.

**Hosting:** Replit **Reserved VM** tier (Deployments → Reserved VM, ~$20/mo as of July 2026). This provides always-on compute with no sleep. Alternatively, a $6/mo DigitalOcean Droplet (1 vCPU, 1 GB RAM) runs Colyseus fine and avoids vendor tie-in.

---

## 2. Game State Authority Model

### What lives on the server

| State | Server-authoritative | Why |
|---|---|---|
| Who is the Impostor | ✅ Yes | Never revealed to clients except the Impostor themselves |
| Player positions | ✅ Yes | Anti-cheat; server enforces speed cap |
| Kill cooldown | ✅ Yes | Prevents rapid-fire kills |
| Task completion (global count) | ✅ Yes | Win condition |
| Game phase | ✅ Yes | LOBBY / GAME / MEETING / RESULT |
| Meeting votes | ✅ Yes | Prevents double-voting |
| Dead player list | ✅ Yes | Source of truth for ejection |

### What stays on the client

| State | Client-only | Why |
|---|---|---|
| Local animation frame | ✅ Yes | Cosmetic; sub-tick |
| Joystick/input state | ✅ Yes | Never sent raw; only resolved position is sent |
| UI state (minimap, prompts) | ✅ Yes | Purely local |
| Sound playback | ✅ Yes | Triggered by server events, played locally |

### Client-side prediction

**Short answer: minimal prediction, aggressive interpolation.**

Among Gas runs at `PLAYER_SPEED = 400 px/s` on a 750 × 1334 canvas. At 100 ms round-trip (Telegram WebView + server), a player moves 40 px without any prediction — clearly visible jank. Use simple dead-reckoning:

```ts
// In RemotePlayer.update(delta):
// Interpolate toward last server-reported position at server tick rate
this.x = Phaser.Math.Linear(this.x, this.serverX, Math.min(1, delta / 100));
this.y = Phaser.Math.Linear(this.y, this.serverY, Math.min(1, delta / 100));
```

Full client-side prediction with rollback (à la Rocket League) is unnecessary for Among Us pace — walking speed is low and being 40–80 px off for one frame is imperceptible.

### Conflict resolution

| Event | Resolution |
|---|---|
| Two players report a body simultaneously | Server processes first packet to arrive; second is rejected (game phase already = MEETING) |
| Two Impostors (future 2-Impostor mode) | Kill cooldowns are per-player; no conflict |
| Player disconnects mid-vote | Their vote is recorded as 'skip' after a 5 s grace period |
| Duplicate `TASK_COMPLETE` message | Server checks `task.completedBy` before counting |

---

## 3. Telegram Integration

### Player Identity via initData

Telegram injects a signed `initData` string into `window.Telegram.WebApp.initData` when the Mini App opens. The server must validate this before trusting any player identity.

**Server-side validation (Node.js, no third-party library):**

```ts
import { createHmac } from 'node:crypto';

function validateInitData(initDataRaw: string, botToken: string): Record<string, string> | null {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  // Sort keys alphabetically, join as "key=value\n" pairs
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // secret_key = HMAC-SHA256("WebAppData", botToken)
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (expectedHash !== hash) return null;

  // Optionally reject stale tokens (auth_date > 5 minutes old)
  const authDate = Number(params.get('auth_date') ?? 0);
  if (Date.now() / 1000 - authDate > 300) return null;

  const userJson = params.get('user');
  return userJson ? JSON.parse(userJson) : null;
}
```

This is the exact algorithm specified in the Telegram Bot API docs (July 2026). The `secret_key` derivation uses the string `"WebAppData"` as the HMAC key — this is not the bot token itself.

### Room Invite Flow

```
User taps /play in group chat
  ↓
Bot creates room → UUID room code
  ↓
Bot replies with inline button:
  [▶ Join Among Gas]  →  t.me/AmongGasBot/game?startapp=ROOM_CODE
  ↓
Friends tap the button → Telegram opens Mini App with startapp param
  ↓
Client reads: const roomCode = Telegram.WebApp.initDataUnsafe.start_param
  ↓
Client sends: WebSocket JOIN_ROOM { roomCode, initData }
  ↓
Server validates initData → admits player
```

**Sharing from within the game (lobby screen):**
```ts
// In LobbyScene.ts — after room is created:
Telegram.WebApp.shareExternalLink(`https://t.me/AmongGasBot/game?startapp=${roomCode}`);
// OR post inline keyboard via Bot API if running inside a group chat context
```

### Telegram Mini App Network Policy (July 2026)

Telegram Mini Apps **can** open WebSocket connections to arbitrary external domains over `wss://`. There is no allowlist requirement. The only constraint is that the WebSocket URL must use `wss://` (TLS) — plain `ws://` is blocked by Telegram's iOS and Android WebViews. Ensure the Colyseus server is behind TLS (Replit deployments provide this automatically on the `.replit.app` domain).

---

## 4. Colyseus Room Schema

Install: `npm install colyseus @colyseus/schema` (server), `colyseus.js` (client).

```ts
// server/schema/GameState.ts
import { Schema, MapSchema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string')  id         = '';
  @type('string')  name       = '';
  @type('string')  color      = '';
  @type('number')  x          = 0;
  @type('number')  y          = 0;
  @type('string')  anim       = 'red_down_1';
  @type('boolean') isAlive    = true;
  @type('boolean') isImpostor = false; // only sent to that player + server
  @type('boolean') hasVoted   = false;
}

export class TaskState extends Schema {
  @type('string')  id          = '';
  @type('string')  objectName  = '';
  @type('boolean') completed   = false;
}

export class GameRoomState extends Schema {
  @type({ map: PlayerState }) players  = new MapSchema<PlayerState>();
  @type([TaskState])          tasks    = new ArraySchema<TaskState>();
  @type('string')             phase    = 'LOBBY'; // LOBBY | GAME | MEETING | RESULT
  @type('number')             tasksDone = 0;
  @type('string')             winner   = '';      // 'crew' | 'impostor' | ''
  @type('number')             meetingCallerId = -1;
}
```

**Note on Impostor secrecy:** Colyseus supports per-client state filtering via `toJSON()` overrides or `@filter()` decorator. Use this to hide `isImpostor: true` from non-Impostor clients — only the Impostor's own client and the server should know.

---

## 5. Message Protocol

All messages over the Colyseus channel. Server → Client state changes use the schema delta system (binary, automatic). Client → Server actions use typed `onMessage` handlers.

### Bandwidth Estimate

- Position update per player: `id(8) + x(4) + y(4) + anim(8) = ~24 bytes`
- 10 players × 10 Hz × 24 bytes = **2,400 bytes/s = ~2.4 KB/s total** — negligible. JSON is fine; binary optimization is not needed at this scale.

### Client → Server Messages

```ts
// Client sends these via room.send(type, payload)

type C2S_Move = {
  x: number;   // local player position
  y: number;
  anim: string; // e.g. 'red_walk_down'
};

type C2S_Kill = {
  targetId: string; // victim's player id
};

type C2S_Report = {
  corpseId: string; // id of the dead player being reported
};

type C2S_EmergencyMeeting = Record<string, never>; // no payload

type C2S_Vote = {
  targetId: string | 'skip';
};

type C2S_TaskComplete = {
  taskId: string;
};

type C2S_ChatReady = Record<string, never>; // player ready in lobby
```

### Server → Client Messages

```ts
// Server dispatches these via this.broadcast() or room.clients.get(id).send()

type S2C_KillConfirmed = {
  killerId: string;
  victimId: string;
};

type S2C_MeetingStart = {
  callerId: string;
  reason: 'emergency' | 'report';
  corpseId?: string;
};

type S2C_VoteTally = {
  ejectedId: string | null; // null = tie/skip
  votes: Record<string, string | 'skip'>; // voterId → targetId
};

type S2C_GameOver = {
  winner: 'crew' | 'impostor';
  impostorId: string; // revealed at game end
};

type S2C_Error = {
  code: 'KILL_OUT_OF_RANGE' | 'NOT_IMPOSTOR' | 'MEETING_COOLDOWN' | 'ALREADY_VOTED';
  message: string;
};
```

---

## 6. Anti-Cheat: Server-Side Validation

```ts
// server/rooms/AmongGasRoom.ts (excerpt)

onMessage('KILL', (client, { targetId }: C2S_Kill) => {
  const attacker = this.state.players.get(client.sessionId);
  const victim   = this.state.players.get(targetId);

  if (!attacker?.isImpostor)     return client.send('ERROR', { code: 'NOT_IMPOSTOR' });
  if (!attacker.isAlive)         return;
  if (!victim?.isAlive)          return;
  if (this.state.phase !== 'GAME') return;

  const dx = attacker.x - victim.x, dy = attacker.y - victim.y;
  const distance = Math.sqrt(dx*dx + dy*dy);
  if (distance > KILL_RADIUS * 1.3) // 30% tolerance for lag
    return client.send('ERROR', { code: 'KILL_OUT_OF_RANGE' });

  victim.isAlive = false;
  this.broadcast('KILL_CONFIRMED', { killerId: client.sessionId, victimId: targetId });
  this.checkWinConditions();
});

onMessage('TASK_COMPLETE', (client, { taskId }: C2S_TaskComplete) => {
  const player = this.state.players.get(client.sessionId);
  const task   = this.state.tasks.find(t => t.id === taskId);

  if (!player?.isAlive || player.isImpostor) return;
  if (!task || task.completed) return;
  if (this.state.phase !== 'GAME') return;

  const dx = player.x - TASK_POSITIONS[taskId].x;
  const dy = player.y - TASK_POSITIONS[taskId].y;
  if (Math.sqrt(dx*dx + dy*dy) > INTERACT_RADIUS * 1.5) return; // proximity check

  task.completed = true;
  this.state.tasksDone++;
  this.checkWinConditions();
});

onMessage('VOTE', (client, { targetId }: C2S_Vote) => {
  const voter = this.state.players.get(client.sessionId);
  if (!voter?.isAlive) return;
  if (this.state.phase !== 'MEETING') return;
  if (voter.hasVoted) return client.send('ERROR', { code: 'ALREADY_VOTED' });

  voter.hasVoted = true;
  this.votes.set(client.sessionId, targetId);
  if (this.votes.size === this.alivePlayers().length) this.resolveMeeting();
});
```

---

## 7. Phaser Client Integration

### New files to create

```
src/
  network/
    NetworkManager.ts    ← Colyseus client singleton, room lifecycle
    RemotePlayer.ts      ← Sprite driven by server state snapshots
  scenes/
    LobbyScene.ts        ← Room code entry, player list, start button
```

### NetworkManager

```ts
// src/network/NetworkManager.ts
import Colyseus from 'colyseus.js';

export class NetworkManager {
  private static client: Colyseus.Client;
  static room: Colyseus.Room | null = null;

  static init() {
    const wsUrl = import.meta.env.VITE_SERVER_URL ?? 'wss://your-replit-app.replit.app';
    this.client = new Colyseus.Client(wsUrl);
  }

  static async createRoom(playerName: string, color: string, initData: string) {
    this.room = await this.client.create('among_gas', { playerName, color, initData });
    return this.room;
  }

  static async joinRoom(roomCode: string, playerName: string, color: string, initData: string) {
    this.room = await this.client.joinById(roomCode, { playerName, color, initData });
    return this.room;
  }
}
```

### GameScene injection points

```ts
// In GameScene.update() — send local position 10x/sec
private networkTick = 0;
update(_time: number, delta: number) {
  // ... existing code ...
  this.networkTick += delta;
  if (NetworkManager.room && this.networkTick >= 100) {
    this.networkTick = 0;
    NetworkManager.room.send('MOVE', {
      x: this.player.x, y: this.player.y,
      anim: this.player.getCurrentAnim(),
    });
  }
}
```

### Preserving Freeplay

Use a registry flag set before launching `GameScene`:

```ts
// In MenuScene when FREEPLAY is clicked:
this.registry.set('gameMode', 'freeplay');

// In MenuScene when MULTIPLAYER is clicked:
this.registry.set('gameMode', 'multiplayer');

// In GameScene.create():
const mode = this.registry.get('gameMode') ?? 'freeplay';
if (mode === 'freeplay') {
  this.spawnBots();     // existing Bot AI
} else {
  this.initMultiplayer(); // NetworkManager + RemotePlayer sprites
}
```

The `LOCAL` menu button already exists in `MenuScene` and is currently non-functional — wire it to the multiplayer lobby flow.

---

## 8. Room Lifecycle

```
LOBBY     Players join via room code. Host sees "Start Game" when ≥ 2 players present.
  ↓ host clicks Start
GAME      Server assigns Impostor randomly. 8 tasks distributed. Tick loop starts at 10 Hz.
  ↓ kill/report/emergency
MEETING   Position updates pause. Voting timer (60 s). All clients show MeetingScene.
  ↓ votes tallied
GAME      Resume (if game not over) — or —
RESULT    Game over. Winner announced. Rematch option shown.
  ↓ rematch
LOBBY     Room resets. Same players stay. New Impostor assigned.
```

### Disconnect handling

- Player disconnects in LOBBY: remove from list, notify others.
- Player disconnects in GAME: mark as dead (they become a ghost). Game continues.
- Player disconnects in MEETING: vote recorded as 'skip' after 10 s timeout.
- All players disconnect: room disposed after 30 s.
- Reconnect within 30 s: Colyseus `allowReconnection(client, 30)` restores session.

---

## 9. Phased Implementation Plan

Each phase is independently deployable and testable.

### Phase 1 — Infrastructure + Identity (est. 2–3 days)

**Goal:** Colyseus server running, Telegram auth validated, room codes working.

- [ ] Create `server/` directory with `package.json` (separate from Vite client)
- [ ] `npm install colyseus @colyseus/schema express` in `server/`
- [ ] Implement `AmongGasRoom` skeleton with `LOBBY` phase only
- [ ] Implement `validateInitData` (see §3)
- [ ] Create `LobbyScene.ts`: create/join room by code, display connected players
- [ ] Set `VITE_SERVER_URL` env var in `.env.development`
- [ ] Wire Replit port 5001 to Colyseus server
- [ ] Test: two browser tabs can join the same room code

### Phase 2 — Position Sync (est. 2 days)

**Goal:** Remote players visible and moving in GameScene.

- [ ] Create `RemotePlayer.ts` (Phaser sprite, updates from server state)
- [ ] `GameScene.initMultiplayer()`: subscribe to `state.players.onAdd/onRemove/onChange`
- [ ] Send `C2S_Move` in `GameScene.update()` at 10 Hz
- [ ] Server validates movement speed (reject teleport)
- [ ] Test: move around, see yourself on another tab

### Phase 3 — Full Game Events (est. 3–5 days)

**Goal:** Kills, tasks, meetings, votes, win/loss all server-driven.

- [ ] Server-side kill validation + broadcast
- [ ] Server-side task completion (proximity check)
- [ ] `MeetingScene` receives player list from server state (not from `GameScene` directly)
- [ ] Vote messages sent to server; tally computed server-side
- [ ] `VictoryScene` triggered by `S2C_GameOver`
- [ ] Impostor identity revealed only at game end
- [ ] Test: play a full game with 3 real clients

### Phase 4 — Telegram Deep-link Invite (est. 1 day)

**Goal:** Share a game from inside Telegram, not just copy-paste a code.

- [ ] Create Telegram Bot via BotFather; configure Mini App URL
- [ ] Implement `/play` command: bot creates room, replies with inline button
- [ ] Client reads `Telegram.WebApp.initDataUnsafe.start_param` on load and auto-joins
- [ ] Test inside actual Telegram (not browser) — initData validation requires real Telegram context

---

## 10. Local Development Setup

```bash
# Terminal 1 — Vite dev server (client)
npm run dev   # port 5000

# Terminal 2 — Colyseus server
cd server && npm run dev   # port 5001 (nodemon + ts-node)
```

Client connects to `ws://localhost:5001` in development. Set in `.env.development`:
```
VITE_SERVER_URL=ws://localhost:5001
```

Production `.env.production`:
```
VITE_SERVER_URL=wss://your-app-name.replit.app
```

**CORS:** Add to Colyseus server:
```ts
import cors from 'cors';
app.use(cors({ origin: process.env.NODE_ENV === 'production'
  ? 'https://your-app-name.replit.app'
  : '*' }));
```

**Simulating 2 players locally:** Open two browser tabs. Colyseus assigns each a unique `sessionId`. Telegram `initData` validation must be **disabled** in development (check `NODE_ENV`).

---

## 11. Deployment on Replit

As of July 2026, Replit offers **Reserved VMs** under Deployments. These are always-on (no sleep) and support persistent WebSocket connections.

### Recommended setup

```
Replit Reserved VM ($20/mo)
  ├── Vite production build served as static files (via `vite build` + `serve`)
  └── Colyseus server on port 5001 (Node.js process)
```

Both can be served from one process:
```ts
// server/index.ts
import express from 'express';
import { Server } from 'colyseus';
import { createServer } from 'http';
import path from 'path';

const app = express();
// Serve Vite build
app.use(express.static(path.join(__dirname, '../dist')));
const httpServer = createServer(app);
const gameServer = new Server({ server: httpServer });
gameServer.define('among_gas', AmongGasRoom);
httpServer.listen(5000); // single port — Replit exposes port 80 externally
```

### Secrets to configure in Replit

```
BOT_TOKEN          =  (from BotFather — never commit to git)
SESSION_SECRET     =  (already present)
NODE_ENV           =  production
```

### Replit deployment steps

1. `npm run build` → `dist/`
2. Set Deployment to run `node server/dist/index.js`
3. In `.replit`: `[[ports]] localPort = 5000 externalPort = 80`

---

## 12. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Cheat via position injection** | High | High | Server validates speed cap (1.2× max) on every `MOVE` message; kills/tasks validated by server proximity check |
| 2 | **Replit Reserved VM restart drops active sessions** | Low | High | Colyseus `allowReconnection(client, 30)` gives 30 s grace; client auto-reconnects with exponential backoff |
| 3 | **Telegram WebView backgrounds the Mini App** | Medium | Medium | Server keeps room alive for 30 s; client reconnects on `visibilitychange` event |
| 4 | **initData is stale or replayed** | Low | High | Validate `auth_date` freshness (reject if > 5 min old) and store used `hash` values in memory to prevent replay within session |
| 5 | **Single Colyseus process becomes bottleneck** | Low (at Mini App scale) | Medium | Among Gas rooms are small (4–10 players). A single 2-vCPU VM handles ~500 concurrent rooms. Add `@colyseus/loadbalancer` when needed. |

---

## 13. Open Questions / Decisions Required Before Phase 2

1. **Colyseus 0.16 `@filter()` decorator support:** The per-client state filtering needed to hide Impostor identity requires `@filter()` in the schema. Verify this works correctly in the current Colyseus 0.16 build before committing to the schema design — an alternative is to send Impostor assignment via a separate private message (`client.send`) rather than through schema state.

2. **Task position coordinates in multiplayer:** In Freeplay, task positions come from the TMX map parsed at runtime by `TmxParser.ts`. The server needs the same coordinates to validate proximity. Decision: ship a pre-computed `taskPositions.json` derived from the TMX, committed to the repo, and imported by both client and server — or parse the TMX on the server too.

3. **Bot behavior in multiplayer:** When a multiplayer game has fewer than 8 human players, should the remaining slots be filled with AI bots (making 8-player games always possible), or is the game played with however many humans joined? Bots in multiplayer would need server-side AI (the current `Bot.ts` is Phaser-only, can't run on the server).

4. **Meeting cooldown shared across all meetings or per-player:** In the current Freeplay code, `emergencyCooldown` is a single timer. In multiplayer, each player gets one Emergency Meeting call per game (standard Among Us rules) — this needs to be tracked per-player on the server.

5. **Replit vs. self-hosted for production:** If the game gains more than ~50 concurrent rooms, Replit Reserved VM becomes a single point of failure. Decide early whether to build for Replit-only or design the server to be deployable anywhere (Docker + env vars). The latter is a 1-day investment upfront that saves a painful migration later.
