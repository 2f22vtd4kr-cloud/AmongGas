export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapObject {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GameMode = 'Freeplay' | 'Multiplayer';

export type TaskType =
  | 'fix_wiring'
  | 'stabilize_nav'
  | 'reboot_wifi'
  | 'fuel_engine'
  | 'start_reactor'
  | 'align_engine'
  | 'empty_garbage'
  | 'clear_asteroids';

export interface TaskDef {
  id: string;
  type: TaskType;
  title: string;
  completed: boolean;
  x: number;
  y: number;
  objectName: string; // TMX object name
}

export interface BotData {
  id: number;
  color: string;
  x: number;
  y: number;
  isImpostor: boolean;
  alive: boolean;
  name: string;
}

export interface VoteResult {
  ejected: number | null; // bot/player id, null = skip
  ejectedName: string;
  ejectedIsImpostor: boolean;
}

export interface GameRegistry {
  playerName: string;
  playerColor: string;
  gameMode: GameMode;
}
