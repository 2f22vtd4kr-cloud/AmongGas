import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

export type SabotageType = '' | 'lights' | 'comms' | 'reactor' | 'o2' | 'doors';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') color = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('string') anim = 'red_down_1';
  @type('boolean') isAlive = true;
  @type('boolean') hasVoted = false;
  // isImpostor is NOT in schema — sent privately via client.send('YOU_ARE_IMPOSTOR')
  // so non-impostor clients never see it, with no need for @filter()
}

export class TaskState extends Schema {
  @type('string') id = '';
  @type('string') objectName = '';
  @type('boolean') completed = false;
}

export class GameRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([TaskState]) tasks = new ArraySchema<TaskState>();
  @type('string') phase = 'LOBBY';
  @type('number') tasksDone = 0;
  @type('string') winner = '';
  @type('string') meetingCallerId = '';

  // ── Sabotage ─────────────────────────────────────────────────────────────
  // '' when no sabotage is active. Only one sabotage may be active at a time.
  @type('string') sabotageType: SabotageType = '';
  // Epoch ms when the active sabotage auto-resolves: for 'reactor'/'o2' this
  // is the meltdown deadline (impostor wins if not fixed by then); for
  // 'lights'/'comms' it's a safety net so a stalled game can't stay dark
  // forever; for 'doors' it's when the lock auto-releases (no manual fix).
  @type('number') sabotageEndsAt = 0;
  // Task ids temporarily blocked from TASK_DONE while 'doors' is active.
  @type(['string']) sabotageLockedTasks = new ArraySchema<string>();
}
