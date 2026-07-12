import Phaser from 'phaser';
import type { GameScene } from './GameScene';
import { NetworkManager } from '../network/NetworkManager';

// ── Data shapes ──────────────────────────────────────────────────────────────

interface FreeMeetingData {
  mode?: 'freeplay';
  gameScene: GameScene;
  playerName: string;
  playerColor: string;
  playerAlive: boolean;
  aliveBots: { id: number; name: string; color: string }[];
}

interface MultiMeetingData {
  mode: 'multiplayer';
  gameScene: GameScene;
  playerSessionId: string;
  playerName: string;
  playerColor: string;
  playerAlive: boolean;
  players: { sessionId: string; name: string; color: string }[];
}

type MeetingData = FreeMeetingData | MultiMeetingData;

// ── Unified voter row (id is always string) ───────────────────────────────────

interface Voter {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
}

interface ChatMessage {
  senderId: string;
  name: string;
  color: string;
  text: string;
}

const CHAT_MAX_LOG      = 8;   // messages kept visible in the panel
const CHAT_INPUT_MAXLEN = 200;

// ── Scene ─────────────────────────────────────────────────────────────────────

export class MeetingScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private isMultiplayer = false;
  private playerSessionId = '';

  private voters: Voter[] = [];
  private votes: Map<string, string | 'skip'> = new Map();
  private votedFor: string | 'skip' | null = null;

  private votingTime = 60;
  private discussTime = 30;
  private phase: 'discuss' | 'vote' | 'result' = 'discuss';
  private timerText?: Phaser.GameObjects.Text;
  private elapsed = 0;
  private voteButtons: Phaser.GameObjects.Container[] = [];
  private playerAlive = true;

  // ── Chat (multiplayer only) ────────────────────────────────────────────────
  private chatMessages: ChatMessage[] = [];
  private chatUnread = 0;
  private chatOpen = false;
  private chatInputEl?: HTMLInputElement;
  private chatToggleBtn?: Phaser.GameObjects.Text;
  private chatBadge?: Phaser.GameObjects.Text;
  private chatPanel?: Phaser.GameObjects.Container;
  private chatLogText?: Phaser.GameObjects.Text;
  private chatInputPreview?: Phaser.GameObjects.Text;
  private chatUnsub?: () => void;

  constructor() {
    super({ key: 'MeetingScene' });
  }

  init(data: MeetingData) {
    this.gameScene = data.gameScene;
    this.playerAlive = data.playerAlive;
    this.votes.clear();
    this.votedFor = null;
    this.elapsed = 0;
    this.phase = 'discuss';
    this.chatMessages = [];
    this.chatUnread = 0;
    this.chatOpen = false;

    if (data.mode === 'multiplayer') {
      this.isMultiplayer = true;
      this.playerSessionId = data.playerSessionId;
      // Build voter list from server players; mark local player with isPlayer flag
      this.voters = data.players.map(p => ({
        id: p.sessionId,
        name: p.name,
        color: p.color,
        isPlayer: p.sessionId === data.playerSessionId,
      }));
    } else {
      this.isMultiplayer = false;
      this.playerSessionId = '';
      // Freeplay: player id '_player', bot ids 'bot_N'
      this.voters = [
        ...(data.playerAlive
          ? [{ id: '_player', name: data.playerName, color: data.playerColor, isPlayer: true }]
          : []),
        ...data.aliveBots.map(b => ({
          id: `bot_${b.id}`,
          name: b.name,
          color: b.color,
          isPlayer: false,
        })),
      ];
    }
  }

  create() {
    const { width: W, height: H } = this.scale;

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.95);

    this.add.text(W / 2, 28, '🚨  EMERGENCY MEETING  🚨', {
      fontSize: '28px', color: '#ff4444', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 70, 'Discussion…', {
      fontSize: '20px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    this.timerText = this.add.text(W - 20, 28, `${this.discussTime}s`, {
      fontSize: '26px', color: '#ffff00', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(1, 0);

    this.buildVoterList();

    if (this.playerAlive) {
      const skipBtn = this.add.text(W / 2, H - 30, '⏭  Skip Vote', {
        fontSize: '24px', color: '#aaaaaa', backgroundColor: '#333',
        padding: { x: 24, y: 14 }, fontFamily: 'Arial',
      }).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
      skipBtn.on('pointerdown', () => this.castVote('skip'));
    } else {
      this.add.text(W / 2, H - 30, '☠  You are dead — spectating only', {
        fontSize: '20px', color: '#555555', fontFamily: 'Arial',
        padding: { x: 24, y: 14 },
      }).setOrigin(0.5, 1);
    }

    this.time.addEvent({ delay: 1000, callback: this.tick, callbackScope: this, loop: true });

    // In multiplayer, wait for the server's VOTE_RESULT instead of tallying locally
    if (this.isMultiplayer) {
      const offVoteResult = NetworkManager.room?.onMessage('VOTE_RESULT', (msg: {
        ejectedId: string | null;
        votes: Record<string, string | 'skip'>;
      }) => {
        if (this.phase === 'result') return;
        this.phase = 'result';
        this.showResultAndClose(msg.ejectedId);
      });
      const offChat = NetworkManager.room?.onMessage('CHAT_MESSAGE', (msg: ChatMessage) => {
        this.onChatMessage(msg);
      });
      this.chatUnsub = () => { offVoteResult?.(); offChat?.(); };

      this.buildChatUi();
    }
  }

  private buildVoterList() {
    const { width: W } = this.scale;
    const startY = 108;
    const rowH = 72;
    const rowW = W - 32;

    this.voteButtons = [];

    const colorMap: Record<string, number> = {
      Red: 0xff2222, Blue: 0x2222ff, Green: 0x22aa22, Orange: 0xff8800,
      Yellow: 0xffff00, Black: 0x111111, Brown: 0x8b4513, Pink: 0xff69b4,
      Purple: 0x8b008b, White: 0xdddddd,
    };

    this.voters.forEach((v, i) => {
      const x = 16;
      const y = startY + i * rowH;
      const container = this.add.container(x, y);

      const bg = this.add.rectangle(0, 0, rowW, rowH - 6, 0x222222).setOrigin(0, 0);
      bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, rowW, rowH - 6), Phaser.Geom.Rectangle.Contains);

      const swatch = this.add.rectangle(12, (rowH - 6) / 2 - 18, 36, 36, colorMap[v.color] ?? 0x666666).setOrigin(0, 0);

      const nameTxt = this.add.text(60, 12, v.isPlayer ? `★ ${v.name}` : v.name, {
        fontSize: '22px', color: '#ffffff', fontFamily: 'Arial', fontStyle: v.isPlayer ? 'bold' : 'normal',
      }).setOrigin(0, 0);

      const subTxt = this.add.text(60, 38, v.isPlayer ? 'You' : 'Crewmate', {
        fontSize: '14px', color: '#888888', fontFamily: 'Arial',
      }).setOrigin(0, 0);

      const votedTxt = this.add.text(rowW - 12, 12, '', {
        fontSize: '18px', color: '#ffff00', fontFamily: 'Arial',
      }).setOrigin(1, 0);

      container.add([bg, swatch, nameTxt, subTxt, votedTxt]);
      this.add.existing(container);

      if (!v.isPlayer) {
        bg.on('pointerdown', () => {
          if (this.phase === 'vote' && this.votedFor === null) {
            this.castVote(v.id);
            bg.setFillStyle(0x443322);
            votedTxt.setText('◀ Voted');
          }
        });
        bg.on('pointerover', () => { if (this.phase === 'vote') bg.setFillStyle(0x443322); });
        bg.on('pointerout',  () => { if (this.votedFor === null) bg.setFillStyle(0x222222); });
      }

      this.voteButtons.push(container);
    });
  }

  private tick() {
    this.elapsed++;
    const remaining = this.phase === 'discuss'
      ? this.discussTime - this.elapsed
      : this.votingTime - (this.elapsed - this.discussTime);

    if (this.timerText) {
      this.timerText.setText(`${Math.max(0, remaining)}s`);
      this.timerText.setColor(remaining <= 10 ? '#ff4444' : '#ffff00');
    }

    if (this.phase === 'discuss' && this.elapsed >= this.discussTime) {
      this.phase = 'vote';
      this.openVoting();
    } else if (this.phase === 'vote' && this.elapsed >= this.discussTime + this.votingTime) {
      // Multiplayer: server decides the result; client timer is just cosmetic.
      // Freeplay: tally locally when time runs out.
      if (!this.isMultiplayer) this.tallyVotes();
    }
  }

  private openVoting() {
    const { width: W } = this.scale;
    this.add.text(W / 2, 70, 'Vote now!', {
      fontSize: '20px', color: '#ffcc00', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Freeplay only: simulate bot votes after a random delay
    if (!this.isMultiplayer) {
      this.time.delayedCall(Phaser.Math.Between(3000, 10000), () => {
        for (const v of this.voters) {
          if (!v.isPlayer && !this.votes.has(v.id)) {
            const candidates = this.voters.filter(x => x.id !== v.id);
            const pick = Phaser.Math.RND.pick(candidates);
            this.votes.set(v.id, pick?.id ?? 'skip');
          }
        }
      });
    }
  }

  private castVote(targetId: string | 'skip') {
    if (!this.playerAlive || this.votedFor !== null || this.phase !== 'vote') return;
    this.votedFor = targetId;

    if (this.isMultiplayer) {
      // Server resolves the vote; we just broadcast our choice
      NetworkManager.room?.send('VOTE', { targetId });
    } else {
      this.votes.set('_player', targetId);
    }

    const { width: W } = this.scale;
    const targetName = targetId === 'skip'
      ? 'Skipped!'
      : this.voters.find(v => v.id === targetId)?.name ?? '?';
    this.add.text(W / 2, 70, `✓ ${targetId === 'skip' ? 'Skipped!' : `Voted for ${targetName}`}`, {
      fontSize: '18px', color: '#00ff88', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
  }

  // ── Chat (multiplayer only) ─────────────────────────────────────────────────

  /** Builds the toggle button, unread badge, and (initially hidden) chat panel. */
  private buildChatUi() {
    const { width: W, height: H } = this.scale;

    this.chatToggleBtn = this.add.text(20, 28, '💬 Chat', {
      fontSize: '20px', color: '#ffffff', backgroundColor: '#333',
      padding: { x: 10, y: 6 }, fontFamily: 'Arial',
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(30);
    this.chatToggleBtn.on('pointerup', () => this.chatOpen ? this.closeChatPanel() : this.openChatPanel());

    this.chatBadge = this.add.text(20 + this.chatToggleBtn.width - 8, 22, '', {
      fontSize: '14px', color: '#ffffff', backgroundColor: '#ff2222',
      padding: { x: 5, y: 1 }, fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(31).setVisible(false);

    const panelW = W * 0.88;
    const panelH = H * 0.6;
    this.chatPanel = this.add.container(W / 2, H / 2).setDepth(40).setVisible(false);

    const bg = this.add.rectangle(0, 0, panelW, panelH, 0x0a0a0a, 0.97).setStrokeStyle(2, 0x555555);
    const title = this.add.text(-panelW / 2 + 16, -panelH / 2 + 12, '💬 Meeting Chat', {
      fontSize: '20px', color: '#ffdd57', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0, 0);
    const closeBtn = this.add.text(panelW / 2 - 16, -panelH / 2 + 12, '✕', {
      fontSize: '22px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.closeChatPanel());

    this.chatLogText = this.add.text(-panelW / 2 + 16, -panelH / 2 + 52, '', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial',
      wordWrap: { width: panelW - 32 }, lineSpacing: 6,
    }).setOrigin(0, 0);

    this.chatPanel.add([bg, title, closeBtn, this.chatLogText]);

    if (this.playerAlive) {
      const inputBoxW = panelW - 128;
      const inputY = panelH / 2 - 60;
      const inputBg = this.add.rectangle(-panelW / 2 + 16, inputY, inputBoxW, 44, 0x222222)
        .setOrigin(0, 0).setStrokeStyle(1, 0x555555).setInteractive({ useHandCursor: true });
      this.chatInputPreview = this.add.text(-panelW / 2 + 26, inputY + 11, 'Type a message…', {
        fontSize: '16px', color: '#888888', fontFamily: 'Arial',
      }).setOrigin(0, 0);
      const sendBtn = this.add.text(panelW / 2 - 16, inputY, 'Send', {
        fontSize: '18px', color: '#ffffff', backgroundColor: '#1a6b3a',
        padding: { x: 14, y: 12 }, fontFamily: 'Arial', fontStyle: 'bold',
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

      inputBg.on('pointerup', () => this.chatInputEl?.focus());
      sendBtn.on('pointerup', () => this.sendChat());

      this.chatPanel.add([inputBg, this.chatInputPreview, sendBtn]);

      // Hidden HTML input for mobile/desktop keyboard — mirrors LobbyScene/MenuScene pattern.
      this.chatInputEl = document.createElement('input');
      this.chatInputEl.type = 'text';
      this.chatInputEl.maxLength = CHAT_INPUT_MAXLEN;
      Object.assign(this.chatInputEl.style, { position: 'fixed', left: '-9999px', top: '0' });
      document.body.appendChild(this.chatInputEl);
      this.chatInputEl.addEventListener('input', () => {
        const v = this.chatInputEl!.value;
        this.chatInputPreview?.setText(v.length ? v : 'Type a message…')
          .setColor(v.length ? '#ffffff' : '#888888');
      });
      this.chatInputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') this.sendChat();
      });
    } else {
      const ghostNote = this.add.text(0, panelH / 2 - 40, '☠ Ghosts can only spectate the chat', {
        fontSize: '15px', color: '#666666', fontFamily: 'Arial',
      }).setOrigin(0.5, 0);
      this.chatPanel.add(ghostNote);
    }
  }

  private openChatPanel() {
    this.chatOpen = true;
    this.chatPanel?.setVisible(true);
    this.chatUnread = 0;
    this.chatBadge?.setVisible(false);
    this.refreshChatLog();
  }

  private closeChatPanel() {
    this.chatOpen = false;
    this.chatPanel?.setVisible(false);
    this.chatInputEl?.blur();
  }

  private sendChat() {
    const text = this.chatInputEl?.value.trim() ?? '';
    if (!text) return;
    NetworkManager.room?.send('CHAT_SEND', { text });
    this.chatInputEl!.value = '';
    this.chatInputPreview?.setText('Type a message…').setColor('#888888');
  }

  private onChatMessage(msg: ChatMessage) {
    this.chatMessages.push(msg);
    if (this.chatMessages.length > 50) this.chatMessages.shift();

    if (this.chatOpen) {
      this.refreshChatLog();
    } else {
      this.chatUnread++;
      this.chatBadge?.setText(String(this.chatUnread)).setVisible(true);
    }
  }

  private refreshChatLog() {
    const recent = this.chatMessages.slice(-CHAT_MAX_LOG);
    const lines = recent.map(m => {
      const who = m.senderId === this.playerSessionId ? 'You' : m.name;
      return `${who}: ${m.text}`;
    });
    this.chatLogText?.setText(lines.length ? lines.join('\n') : 'No messages yet — say hi!');
  }

  // ── Freeplay tally (server handles this in multiplayer) ────────────────────

  private tallyVotes() {
    if (this.phase === 'result') return;
    this.phase = 'result';

    for (const v of this.voters) {
      if (!v.isPlayer && !this.votes.has(v.id)) {
        this.votes.set(v.id, 'skip');
      }
    }

    const tally = new Map<string, number>();
    for (const target of this.votes.values()) {
      tally.set(target, (tally.get(target) ?? 0) + 1);
    }

    let maxVotes = 0;
    let ejected: string | 'skip' = 'skip';
    let tied = false;
    for (const [k, cnt] of tally) {
      if (cnt > maxVotes) { maxVotes = cnt; ejected = k; tied = false; }
      else if (cnt === maxVotes && k !== 'skip') { tied = true; }
    }
    if (tied) ejected = 'skip';

    this.showResultAndClose(ejected === 'skip' ? null : ejected);
  }

  // ── Shared result display ──────────────────────────────────────────────────

  private showResultAndClose(ejectedId: string | null) {
    const { width: W, height: H } = this.scale;

    const ejectedVoter = ejectedId ? this.voters.find(v => v.id === ejectedId) : null;
    const msg = ejectedVoter
      ? `${ejectedVoter.name} was ejected!`
      : 'No one was ejected. (Skipped)';

    this.add.rectangle(W / 2, H / 2, W * 0.85, 140, 0x000000, 0.9).setDepth(20);
    this.add.text(W / 2, H / 2, msg, {
      fontSize: '28px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
      align: 'center', wordWrap: { width: W * 0.8 },
    }).setOrigin(0.5).setDepth(21);

    this.time.delayedCall(3000, () => {
      if (this.isMultiplayer) {
        // GameScene.resolveMeetingMultiplayer handles the ejection side-effects
        this.gameScene.resolveMeetingMultiplayer(ejectedId);
      } else {
        // Convert string id back to the number GameScene.resolveMeeting expects
        let numId: number | null = null;
        if (ejectedId === '_player') numId = -1;
        else if (ejectedId?.startsWith('bot_')) numId = parseInt(ejectedId.replace('bot_', ''), 10);
        this.gameScene.resolveMeeting(numId);
      }
      this.scene.stop('MeetingScene');
    });
  }

  shutdown() {
    this.chatUnsub?.();
    this.chatUnsub = undefined;
    this.chatInputEl?.remove();
    this.chatInputEl = undefined;
  }
}
