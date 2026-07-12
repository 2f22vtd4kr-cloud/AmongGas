import Phaser from 'phaser';
import { Room } from '@colyseus/sdk';
import { NetworkManager } from '../network/NetworkManager';
import { WIDTH, HEIGHT } from '../settings';

export class LobbyScene extends Phaser.Scene {
  private playerName = '';
  private playerColor = '';
  private roomCodeInput: HTMLInputElement | null = null;
  private entryObjects: Phaser.GameObjects.GameObject[] = [];
  private waitingObjects: Phaser.GameObjects.GameObject[] = [];
  private playerListText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Text;
  private errorText?: Phaser.GameObjects.Text;
  private pollEvent?: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create() {
    this.playerName  = (this.registry.get('playerName')  as string) ?? 'Crewmate';
    this.playerColor = (this.registry.get('playerColor') as string) ?? 'Red';

    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x0a0a1a);
    this.add.text(WIDTH / 2, 90, 'MULTIPLAYER', {
      fontSize: '46px', color: '#ffffff',
      fontFamily: 'AmongUs, Arial', stroke: '#c8160c', strokeThickness: 4,
    }).setOrigin(0.5);

    const startParam = this.getStartParam();
    if (NetworkManager.room) {
      this.showWaitingRoom();
    } else if (startParam) {
      this.joinByCode(startParam);
    } else {
      this.showEntry();
    }
  }

  // ─── Entry (Create / Join) ────────────────────────────────────────────────

  private showEntry() {
    const W = WIDTH, H = HEIGHT;
    const o = this.entryObjects;

    o.push(this.add.text(W / 2, 190, `${this.playerName}  (${this.playerColor})`, {
      fontSize: '20px', color: '#888888', fontFamily: 'Arial',
    }).setOrigin(0.5));

    const createBtn = this.add.text(W / 2, 320, '＋  Create Room', {
      fontSize: '28px', color: '#ffffff', fontFamily: 'AmongUs, Arial',
      backgroundColor: '#c8160c', padding: { x: 28, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    createBtn.on('pointerup', () => this.createRoom());
    o.push(createBtn);

    o.push(this.add.text(W / 2, 420, '— or join existing room —', {
      fontSize: '18px', color: '#444444', fontFamily: 'Arial',
    }).setOrigin(0.5));

    o.push(this.add.text(W / 2, 490, 'Room Code', {
      fontSize: '20px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5));

    const codeDisplay = this.add.text(W / 2, 555, '_ _ _ _ _', {
      fontSize: '36px', color: '#ffdd57', fontFamily: 'Arial, monospace',
      backgroundColor: '#1a1a2e', padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    codeDisplay.on('pointerup', () => this.roomCodeInput?.focus());
    o.push(codeDisplay);

    // Hidden HTML input for mobile keyboard
    this.roomCodeInput = document.createElement('input');
    this.roomCodeInput.type = 'text';
    this.roomCodeInput.maxLength = 9;
    Object.assign(this.roomCodeInput.style, { position: 'fixed', left: '-9999px', top: '0' });
    document.body.appendChild(this.roomCodeInput);
    this.roomCodeInput.addEventListener('input', () => {
      const v = this.roomCodeInput!.value.toUpperCase().slice(0, 9);
      this.roomCodeInput!.value = v;
      codeDisplay.setText(v || '_ _ _ _ _');
    });
    this.roomCodeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.joinByCode(this.roomCodeInput?.value ?? '');
    });

    const joinBtn = this.add.text(W / 2, 648, '▶  Join Room', {
      fontSize: '26px', color: '#ffffff', fontFamily: 'Arial',
      backgroundColor: '#1a3a5c', padding: { x: 28, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    joinBtn.on('pointerup', () => this.joinByCode(this.roomCodeInput?.value ?? ''));
    o.push(joinBtn);

    this.errorText = this.add.text(W / 2, 730, '', {
      fontSize: '18px', color: '#ff6666', fontFamily: 'Arial',
    }).setOrigin(0.5);
    o.push(this.errorText);

    const backBtn = this.add.text(W / 2, H - 80, '← Back to Menu', {
      fontSize: '22px', color: '#666666', fontFamily: 'Arial',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerup', () => {
      NetworkManager.leave();
      this.cleanupInput();
      this.scene.start('MenuScene');
    });
    o.push(backBtn);
  }

  private async createRoom() {
    this.setEntryStatus('Creating room…', '#ffdd57');
    try {
      await NetworkManager.createRoom(this.playerName, this.playerColor, this.getInitData());
      this.registry.set('isHost', true);
      this.cleanupInput();
      this.clearEntryObjects();
      this.showWaitingRoom();
    } catch (e) {
      console.error('[LobbyScene] createRoom error', e);
      this.setEntryStatus('Could not connect. Is the server running?', '#ff6666');
    }
  }

  private async joinByCode(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { this.setEntryStatus('Enter a room code first.', '#ff6666'); return; }
    this.setEntryStatus(`Joining ${trimmed}…`, '#ffdd57');
    try {
      await NetworkManager.joinRoom(trimmed, this.playerName, this.playerColor, this.getInitData());
      this.registry.set('isHost', false);
      this.cleanupInput();
      this.clearEntryObjects();
      this.showWaitingRoom();
    } catch (e) {
      console.error('[LobbyScene] joinByCode error', e);
      this.setEntryStatus('Room not found or full.', '#ff6666');
    }
  }

  private setEntryStatus(msg: string, color = '#ffffff') {
    this.errorText?.setText(msg).setColor(color);
  }

  private clearEntryObjects() {
    this.entryObjects.forEach(o => o.destroy());
    this.entryObjects = [];
  }

  // ─── Waiting room ─────────────────────────────────────────────────────────

  private showWaitingRoom() {
    const W = WIDTH, H = HEIGHT;
    const room = NetworkManager.room as Room;
    const o = this.waitingObjects;

    const roomCode = (room as Room & { roomId?: string }).roomId ?? '???';

    o.push(this.add.text(W / 2, 170, `Code: ${roomCode}`, {
      fontSize: '28px', color: '#ffdd57', fontFamily: 'Arial',
    }).setOrigin(0.5));

    const shareBtn = this.add.text(W / 2, 222, '📤  Share Invite', {
      fontSize: '20px', color: '#57c7ff', fontFamily: 'Arial',
      backgroundColor: '#1a2a3a', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    shareBtn.on('pointerup', () => this.shareRoom(roomCode));
    o.push(shareBtn);

    o.push(this.add.text(W / 2, 290, 'PLAYERS', {
      fontSize: '20px', color: '#666666', fontFamily: 'Arial',
    }).setOrigin(0.5));

    this.playerListText = this.add.text(W / 2, 330, '', {
      fontSize: '22px', color: '#cccccc', fontFamily: 'Arial',
      align: 'center', lineSpacing: 10,
    }).setOrigin(0.5, 0);
    o.push(this.playerListText);

    this.statusText = this.add.text(W / 2, H - 250, '', {
      fontSize: '18px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5);
    o.push(this.statusText);

    const isHost = (this.registry.get('isHost') as boolean) ?? false;

    this.startBtn = this.add.text(W / 2, H - 178, '▶  Start Game', {
      fontSize: '30px', color: '#ffffff', fontFamily: 'AmongUs, Arial',
      backgroundColor: '#c8160c', padding: { x: 30, y: 14 },
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    this.startBtn.on('pointerup', () => {
      room.send('START_GAME', {});
      this.startBtn.setVisible(false);
      this.statusText.setText('Starting game…');
    });
    o.push(this.startBtn);

    if (!isHost) {
      o.push(this.add.text(W / 2, H - 178, 'Waiting for host to start…', {
        fontSize: '20px', color: '#888888', fontFamily: 'Arial',
      }).setOrigin(0.5));
    }

    const backBtn = this.add.text(W / 2, H - 80, '← Back to Menu', {
      fontSize: '22px', color: '#666666', fontFamily: 'Arial',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerup', () => {
      NetworkManager.leave();
      this.scene.start('MenuScene');
    });
    o.push(backBtn);

    this.subscribeToRoom(room, isHost);
    this.refreshPlayerList(room);

    this.pollEvent = this.time.addEvent({
      delay: 200, loop: true,
      callback: () => this.onPoll(room, isHost),
      callbackScope: this,
    });
  }

  private subscribeToRoom(room: Room, isHost: boolean) {
    const state = room.state as Record<string, unknown> & {
      players?: { onAdd?: (fn: () => void) => void; onRemove?: (fn: () => void) => void };
      phase?: string;
    };

    state.players?.onAdd?.(() => this.refreshPlayerList(room));
    state.players?.onRemove?.(() => this.refreshPlayerList(room));

    room.onMessage('YOU_ARE_IMPOSTOR', () => this.registry.set('isImpostor', true));
    room.onMessage('YOU_ARE_CREW',     () => this.registry.set('isImpostor', false));
    room.onMessage('START_GAME',       () => this.launchGame());

    // Also watch via state change
    room.onStateChange.once(() => {
      const s = room.state as { phase?: string };
      if (s.phase === 'GAME') this.launchGame();
    });

    void isHost; // used in showWaitingRoom directly
  }

  private onPoll(room: Room, isHost: boolean) {
    const state = room.state as { players?: Map<string, unknown>; phase?: string };
    const count = state.players?.size ?? 0;

    this.startBtn?.setVisible(isHost && count >= 2);
    if (this.statusText) {
      this.statusText.setText(
        count < 2
          ? 'Need at least 2 players'
          : isHost
            ? `${count} player${count !== 1 ? 's' : ''} ready`
            : 'Waiting for host to start…'
      );
    }

    if (state.phase === 'GAME') this.launchGame();
  }

  private launchGame() {
    this.pollEvent?.remove();
    this.registry.set('gameMode', 'online');
    this.scene.start('GamePreloadScene', { mode: 'multiplayer' });
  }

  private refreshPlayerList(room: Room) {
    if (!this.playerListText) return;
    const state = room.state as { players?: Map<string, { name: string; color: string }> };
    const lines: string[] = [];
    state.players?.forEach(p => lines.push(`${p.name}  (${p.color})`));
    this.playerListText.setText(lines.join('\n'));
  }

  private shareRoom(roomCode: string) {
    const url = `https://t.me/AmongGasBot/game?startapp=${roomCode}`;
    const tg = (window as Window & {
      Telegram?: { WebApp?: { shareExternalLink?(u: string): void } };
    }).Telegram?.WebApp;
    if (tg?.shareExternalLink) {
      tg.shareExternalLink(url);
    } else {
      navigator.clipboard?.writeText(roomCode).catch(() => {});
      this.showBrief(`Code copied: ${roomCode}`);
    }
  }

  private showBrief(msg: string) {
    const t = this.add.text(WIDTH / 2, HEIGHT - 40, msg, {
      fontSize: '16px', color: '#57c7ff', fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10);
    this.time.delayedCall(2000, () => t.destroy());
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getStartParam(): string {
    return (window as Window & {
      Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
    }).Telegram?.WebApp?.initDataUnsafe?.start_param ?? '';
  }

  private getInitData(): string {
    return (window as Window & {
      Telegram?: { WebApp?: { initData?: string } };
    }).Telegram?.WebApp?.initData ?? '';
  }

  private cleanupInput() {
    this.roomCodeInput?.remove();
    this.roomCodeInput = null;
  }

  shutdown() {
    this.cleanupInput();
    this.pollEvent?.remove();
  }
}
