// Game constants (ported from Python settings.py)

export const WIDTH = 1280;
export const HEIGHT = 720;
export const FPS = 60;
export const TILESIZE = 32;
export const PLAYER_SPEED = 400;
export const NO_OF_MISSIONS = 8;
export const NO_OF_BOTS = 8;

// World dimensions: 181×99 tiles × 32px each
export const WORLD_WIDTH = 181 * 32;  // 5792
export const WORLD_HEIGHT = 99 * 32;  // 3168

// Player spawn (from TMX object layer)
export const PLAYER_SPAWN = { x: 4528, y: 1712 };

// Bot positions (from Python settings.py)
export const BOT_POS: { x: number; y: number }[] = [
  { x: 5401, y: 1530 },
  { x: 3686, y: 1857 },
  { x: 3733, y: 2626 },
  { x: 2325, y: 1814 },
  { x: 1718, y: 1282 },
  { x: 1288, y: 2418 },
  { x: 1249, y: 506 },
  { x: 2513, y: 1286 },
];

export const PLAYER_COLORS = ['Red', 'Blue', 'Orange', 'Yellow', 'Green'];
export const ALL_COLORS = ['Black', 'Blue', 'Brown', 'Green', 'Orange', 'Pink', 'Purple', 'Red', 'White', 'Yellow'];

// Kill / interact detection radius
export const KILL_RADIUS = 80;
export const INTERACT_RADIUS = 120;
export const REPORT_RADIUS = 150;

// Night / light mask
export const NIGHT_COLOR = 0x141414;
export const LIGHT_RADIUS = 500;

// Footstep rate (ms between steps)
export const STEPPING_RATE = 230;

// Ambient sound centre positions (x, y) in world coords
export const AMBIENT_CENTRES: Record<string, { x: number; y: number; radius: number }> = {
  cafeteria:       { x: 3277, y: 658,  radius: 750 },
  medbay_room:     { x: 2338, y: 1147, radius: 450 },
  security_room:   { x: 1877, y: 1095, radius: 350 },
  reactor_room:    { x: 729,  y: 1395, radius: 450 },
  u_engine_room:   { x: 1281, y: 711,  radius: 400 },
  l_engine_room:   { x: 1281, y: 2175, radius: 400 },
  electrical_room: { x: 2090, y: 1943, radius: 570 },
  storage_room:    { x: 3600, y: 2500, radius: 580 },
  admin_room:      { x: 3950, y: 1807, radius: 400 },
  comms3:          { x: 3820, y: 2467, radius: 370 },
  oxygen_room:     { x: 1950, y: 500,  radius: 250 },
  cockpit:         { x: 5400, y: 1380, radius: 300 },
  weapons:         { x: 4450, y: 375,  radius: 400 },
};

// Task titles (from Python tasks.py)
export const TASK_TITLES: Record<string, string> = {
  fix_wiring:       'Fix The Electricity Wires',
  stabilize_nav:    "Stabilize The Ship's Navigation",
  reboot_wifi:      'Reboot The Wifi',
  fuel_engine:      'Fuel Lower Engine',
  start_reactor:    'Divert Power To Reactor',
  align_engine:     'Align Engine Output',
  empty_garbage:    'Empty The Garbage',
  clear_asteroids:  'Clear the Asteroids (30)',
};
