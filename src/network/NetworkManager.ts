import { Client, Room } from '@colyseus/sdk';

/** Derive the Colyseus WebSocket URL automatically. */
function getServerUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteEnv = (import.meta as any).env as Record<string, string> | undefined;
  if (viteEnv?.VITE_SERVER_URL) return viteEnv.VITE_SERVER_URL;

  const { hostname, protocol } = window.location;
  const ws = protocol === 'https:' ? 'wss:' : 'ws:';

  // Replit dev URL: "<port>-<hash>.<user>.replit.dev" — swap port to 5001.
  if (hostname.includes('.replit.dev')) {
    return `${ws}//${hostname.replace(/^\d+/, '5001')}`;
  }

  return `ws://localhost:5001`;
}

export class NetworkManager {
  private static _client: Client | null = null;
  static room: Room | null = null;

  static init() {
    const url = getServerUrl();
    console.log('[NetworkManager] Connecting to', url);
    this._client = new Client(url);
  }

  static get client(): Client {
    if (!this._client) this.init();
    return this._client!;
  }

  static async createRoom(
    playerName: string,
    color: string,
    initData: string,
  ): Promise<Room> {
    this.room = await this.client.create('among_gas', { playerName, color, initData });
    return this.room;
  }

  static async joinRoom(
    roomCode: string,
    playerName: string,
    color: string,
    initData: string,
  ): Promise<Room> {
    this.room = await this.client.joinById(roomCode, { playerName, color, initData });
    return this.room;
  }

  static leave() {
    this.room?.leave();
    this.room = null;
  }
}
