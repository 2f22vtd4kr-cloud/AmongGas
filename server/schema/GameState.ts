import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

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
}
