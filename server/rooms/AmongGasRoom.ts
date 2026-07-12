import { Room, Client } from 'colyseus';
import { ArraySchema } from '@colyseus/schema';
import { GameRoomState, PlayerState, TaskState } from '../schema/GameState';
import { validateInitData } from '../auth/telegram';

// Mirror of src/settings.ts — keep in sync
const KILL_RADIUS       = 80;
const INTERACT_RADIUS   = 120;
const PLAYER_SPEED_MAX  = 400 * 1.3; // px/s with 30% lag tolerance
const TICK_MS           = 100;        // 10 Hz
const RECONNECT_GRACE   = 30;         // seconds
const KILL_COOLDOWN_MS  = 15_000;
const VOTE_TIMEOUT_MS   = 60_000;

// Task world positions (from TMX — keep in sync with TmxParser output)
const TASK_POSITIONS: Record<string, { x: number; y: number }> = {
  fix_wiring:      { x: 2191, y: 1672 },
  stabilize_nav:   { x: 5390, y: 1166 },
  reboot_wifi:     { x: 2256, y: 1690 },
  fuel_engine:     { x: 1169, y: 2179 },
  start_reactor:   { x:  909, y: 1023 },
  align_engine:    { x: 2496, y: 1735 },
  empty_garbage:   { x: 3884, y: 2484 },
  clear_asteroids: { x: 3092, y:  418 },
};
const TASK_NAMES    = Object.keys(TASK_POSITIONS);
const NO_OF_MISSIONS = 8;

// Player spawn
const SPAWN_X = 4528;
const SPAWN_Y = 1712;

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

export class AmongGasRoom extends Room {
  // Colyseus 0.17: state is declared as a class property (no this.setState())
  state = new GameRoomState();
  maxClients = 15;

  private votes        = new Map<string, string>();
  private voteTimer:     ReturnType<typeof setTimeout> | null = null;
  private killCooldowns  = new Map<string, number>();
  private emergencyUses  = new Map<string, number>();
  private lastPositions  = new Map<string, { x: number; y: number; t: number }>();
  // Track which sessionId is the impostor (not exposed in schema)
  private impostorSid    = '';

  onCreate(_options: Record<string, unknown>) {
    const tasks = new ArraySchema<TaskState>();
    for (let i = 0; i < NO_OF_MISSIONS; i++) {
      const t = new TaskState();
      t.id = `task_${i}`;
      t.objectName = TASK_NAMES[i % TASK_NAMES.length];
      t.completed = false;
      tasks.push(t);
    }
    this.state.tasks = tasks;
    this.state.phase = 'LOBBY';

    this.onMessage('START_GAME',  (client)      => this.handleStartGame(client));
    this.onMessage('MOVE',        (client, msg) => this.handleMove(client, msg));
    this.onMessage('KILL',        (client, msg) => this.handleKill(client, msg));
    this.onMessage('REPORT',      (client, msg) => this.handleReport(client, msg));
    this.onMessage('EMERGENCY',   (client)      => this.handleEmergency(client));
    this.onMessage('VOTE',        (client, msg) => this.handleVote(client, msg));
    this.onMessage('TASK_DONE',   (client, msg) => this.handleTaskDone(client, msg));

    console.log(`[AmongGasRoom] ${this.roomId} created`);
  }

  async onJoin(client: Client, options: {
    playerName?: string;
    color?: string;
    initData?: string;
  }) {
    const botToken = process.env.BOT_TOKEN ?? '';
    const isDev    = process.env.NODE_ENV !== 'production';

    let userId = `dev_${client.sessionId}`;
    if (!isDev && options.initData) {
      const user = validateInitData(options.initData, botToken);
      if (!user) { client.leave(4001); return; }
      userId = String((user as { id?: number }).id ?? client.sessionId);
    }

    const p = new PlayerState();
    p.id       = userId;
    p.name     = (options.playerName ?? 'Crewmate').slice(0, 15);
    p.color    = options.color ?? 'Red';
    p.x        = SPAWN_X;
    p.y        = SPAWN_Y;
    p.anim     = `${p.color.toLowerCase()}_down_1`;
    p.isAlive  = true;
    p.hasVoted = false;

    this.state.players.set(client.sessionId, p);
    this.killCooldowns.set(client.sessionId, 0);
    this.emergencyUses.set(client.sessionId, 0);
    this.lastPositions.set(client.sessionId, { x: p.x, y: p.y, t: Date.now() });

    console.log(`[AmongGasRoom] ${p.name} joined — ${this.clients.length}/${this.maxClients} players`);
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;

    if (!consented && this.state.phase === 'GAME') {
      try {
        await this.allowReconnection(client, RECONNECT_GRACE);
        console.log(`[AmongGasRoom] ${p.name} reconnected`);
        return;
      } catch {
        p.isAlive = false;
        this.broadcast('PLAYER_DISCONNECTED', { sessionId: client.sessionId });
        this.checkWinConditions();
      }
    } else {
      this.state.players.delete(client.sessionId);
      this.killCooldowns.delete(client.sessionId);
      this.emergencyUses.delete(client.sessionId);
      this.lastPositions.delete(client.sessionId);
    }
    console.log(`[AmongGasRoom] ${p.name} left — ${this.clients.length} remaining`);
  }

  onDispose() {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    console.log(`[AmongGasRoom] ${this.roomId} disposed`);
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private handleStartGame(client: Client) {
    if (this.state.phase !== 'LOBBY') return;
    if (this.clients.length < 2)     return;
    if (!this.isHost(client))        return;

    const sessionIds = [...this.state.players.keys()];
    const impIdx     = Math.floor(Math.random() * sessionIds.length);
    this.impostorSid = sessionIds[impIdx];

    sessionIds.forEach(sid => {
      const p = this.state.players.get(sid)!;
      p.hasVoted = false;
      p.isAlive  = true;
    });

    this.state.tasks.forEach(t => { t.completed = false; });
    this.state.tasksDone = 0;
    this.state.winner    = '';
    this.votes.clear();
    this.emergencyUses.forEach((_, k) => this.emergencyUses.set(k, 0));
    this.killCooldowns.forEach((_, k) => this.killCooldowns.set(k, 0));

    this.state.phase = 'GAME';

    // Tell each client their role privately (never in shared schema)
    this.clients.forEach(c => {
      if (c.sessionId === this.impostorSid) {
        c.send('YOU_ARE_IMPOSTOR', {});
      } else {
        c.send('YOU_ARE_CREW', {});
      }
    });

    this.setSimulationInterval(() => this.tick(), TICK_MS);
    console.log(`[AmongGasRoom] Game started with ${this.clients.length} players`);
  }

  private tick() {
    if (this.state.phase !== 'GAME') return;
    this.killCooldowns.forEach((ms, sid) => {
      if (ms > 0) this.killCooldowns.set(sid, Math.max(0, ms - TICK_MS));
    });
  }

  private handleMove(client: Client, msg: { x: number; y: number; anim: string }) {
    if (this.state.phase !== 'GAME') return;
    const p = this.state.players.get(client.sessionId);
    if (!p?.isAlive) return;

    const now  = Date.now();
    const prev = this.lastPositions.get(client.sessionId);
    if (prev) {
      const elapsed_s = Math.max((now - prev.t) / 1000, 0.016);
      const moved     = dist(msg.x, msg.y, prev.x, prev.y);
      const maxMove   = PLAYER_SPEED_MAX * elapsed_s + 50; // +50 px absolute burst tolerance
      if (moved > maxMove) {
        client.send('POSITION_CORRECTION', { x: p.x, y: p.y });
        return;
      }
    }

    p.x    = msg.x;
    p.y    = msg.y;
    p.anim = msg.anim ?? p.anim;
    this.lastPositions.set(client.sessionId, { x: msg.x, y: msg.y, t: now });
  }

  private handleKill(client: Client, msg: { targetId: string }) {
    if (this.state.phase !== 'GAME') return;
    if (client.sessionId !== this.impostorSid)
      return client.send('ERROR', { code: 'NOT_IMPOSTOR' });

    const attacker = this.state.players.get(client.sessionId);
    const victim   = this.state.players.get(msg.targetId);
    if (!attacker?.isAlive || !victim?.isAlive) return;
    if ((this.killCooldowns.get(client.sessionId) ?? 0) > 0)
      return client.send('ERROR', { code: 'KILL_COOLDOWN' });

    if (dist(attacker.x, attacker.y, victim.x, victim.y) > KILL_RADIUS * 1.3)
      return client.send('ERROR', { code: 'KILL_OUT_OF_RANGE' });

    victim.isAlive = false;
    this.killCooldowns.set(client.sessionId, KILL_COOLDOWN_MS);
    this.broadcast('KILL_CONFIRMED', { killerId: client.sessionId, victimId: msg.targetId });
    this.checkWinConditions();
  }

  private handleReport(client: Client, msg: { corpseId: string }) {
    if (this.state.phase !== 'GAME') return;
    const reporter = this.state.players.get(client.sessionId);
    if (!reporter?.isAlive) return;
    this.startMeeting(client.sessionId, 'report', msg.corpseId);
  }

  private handleEmergency(client: Client) {
    if (this.state.phase !== 'GAME') return;
    const caller = this.state.players.get(client.sessionId);
    if (!caller?.isAlive) return;
    const uses = this.emergencyUses.get(client.sessionId) ?? 0;
    if (uses >= 1) return client.send('ERROR', { code: 'EMERGENCY_USED' });
    this.emergencyUses.set(client.sessionId, uses + 1);
    this.startMeeting(client.sessionId, 'emergency');
  }

  private startMeeting(callerId: string, reason: 'emergency' | 'report', corpseId?: string) {
    this.state.phase = 'MEETING';
    this.state.meetingCallerId = callerId;
    this.votes.clear();
    this.state.players.forEach(p => { p.hasVoted = false; });
    this.broadcast('MEETING_STARTED', { callerId, reason, corpseId });
    this.voteTimer = setTimeout(() => this.resolveMeeting(), VOTE_TIMEOUT_MS);
  }

  private handleVote(client: Client, msg: { targetId: string }) {
    if (this.state.phase !== 'MEETING') return;
    const voter = this.state.players.get(client.sessionId);
    if (!voter?.isAlive) return;
    if (voter.hasVoted) return client.send('ERROR', { code: 'ALREADY_VOTED' });

    voter.hasVoted = true;
    this.votes.set(client.sessionId, msg.targetId);

    const aliveCount = [...this.state.players.values()].filter(p => p.isAlive).length;
    if (this.votes.size >= aliveCount) {
      if (this.voteTimer) { clearTimeout(this.voteTimer); this.voteTimer = null; }
      this.resolveMeeting();
    }
  }

  private resolveMeeting() {
    const tally = new Map<string, number>();
    for (const target of this.votes.values()) {
      tally.set(target, (tally.get(target) ?? 0) + 1);
    }

    let maxVotes = 0, ejected: string | null = null, tied = false;
    for (const [id, count] of tally) {
      if (id === 'skip') continue;
      if (count > maxVotes) { maxVotes = count; ejected = id; tied = false; }
      else if (count === maxVotes) tied = true;
    }
    if (tied) ejected = null;

    if (ejected) {
      const p = this.state.players.get(ejected);
      if (p) p.isAlive = false;
    }

    const voteRecord: Record<string, string> = {};
    this.votes.forEach((v, k) => { voteRecord[k] = v; });
    this.broadcast('VOTE_RESULT', { ejectedId: ejected, votes: voteRecord });

    this.state.phase = 'GAME';
    this.checkWinConditions();
  }

  private handleTaskDone(client: Client, msg: { taskId: string }) {
    if (this.state.phase !== 'GAME') return;
    const p    = this.state.players.get(client.sessionId);
    const task = this.state.tasks.find(t => t.id === msg.taskId);

    if (!p?.isAlive || client.sessionId === this.impostorSid) return;
    if (!task || task.completed) return;

    const pos = TASK_POSITIONS[task.objectName];
    if (!pos) return;
    if (dist(p.x, p.y, pos.x, pos.y) > INTERACT_RADIUS * 1.5) return;

    task.completed = true;
    this.state.tasksDone++;
    this.checkWinConditions();
  }

  // ─── Win conditions ────────────────────────────────────────────────────────

  private checkWinConditions() {
    if (this.state.phase === 'RESULT') return;

    // IMPORTANT: players map is keyed by sessionId, not p.id.
    // p.id is the Telegram userId (or "dev_<sessionId>" in dev).
    // impostorSid is the raw sessionId — always compare by map key.
    let aliveCrewCount = 0;
    let impostorAlive  = false;
    this.state.players.forEach((p, sid) => {
      if (!p.isAlive) return;
      if (sid === this.impostorSid) impostorAlive = true;
      else aliveCrewCount++;
    });

    if (this.state.tasksDone >= NO_OF_MISSIONS) return this.endGame('crew');
    if (!impostorAlive)                          return this.endGame('crew');
    if (1 >= aliveCrewCount)                     return this.endGame('impostor');
  }

  private endGame(winner: 'crew' | 'impostor') {
    this.state.phase  = 'RESULT';
    this.state.winner = winner;
    this.broadcast('GAME_OVER', { winner, impostorId: this.impostorSid });
    console.log(`[AmongGasRoom] ${this.roomId} — ${winner} wins`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isHost(client: Client): boolean {
    return this.clients[0]?.sessionId === client.sessionId;
  }
}
