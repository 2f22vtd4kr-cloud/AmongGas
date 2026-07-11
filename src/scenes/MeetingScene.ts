import Phaser from 'phaser';
import type { GameScene } from './GameScene';

interface MeetingData {
  gameScene: GameScene;
  playerName: string;
  playerColor: string;
  playerAlive: boolean;
  aliveBots: { id: number; name: string; color: string }[];
}

export class MeetingScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private voters: { id: number; name: string; color: string; isPlayer: boolean }[] = [];
  private votes: Map<number | 'player', number | 'skip'> = new Map();
  private votedFor: number | 'skip' | null = null;
  private votingTime = 60;
  private discussTime = 30;
  private phase: 'discuss' | 'vote' | 'result' = 'discuss';
  private timerText?: Phaser.GameObjects.Text;
  private elapsed = 0;
  private voteButtons: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'MeetingScene' });
  }

  init(data: MeetingData) {
    this.gameScene = data.gameScene;

    this.voters = [
      { id: -1, name: data.playerName, color: data.playerColor, isPlayer: true },
      ...data.aliveBots.map(b => ({ ...b, isPlayer: false })),
    ];
    this.votes.clear();
    this.votedFor = null;
    this.elapsed = 0;
    this.phase = 'discuss';
  }

  create() {
    const { width: W, height: H } = this.scale;

    // Dark overlay
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.95);

    // Header
    this.add.text(W / 2, 24, '🚨  EMERGENCY MEETING  🚨', {
      fontSize: '26px', color: '#ff4444', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 60, 'Discussion…', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // Timer
    this.timerText = this.add.text(W - 20, 24, `${this.discussTime}s`, {
      fontSize: '22px', color: '#ffff00', fontFamily: 'Arial',
    }).setOrigin(1, 0);

    // Voter list
    this.buildVoterList();

    // Skip button
    const skipBtn = this.add.text(W / 2, H - 40, '⏭  Skip Vote', {
      fontSize: '20px', color: '#aaaaaa', backgroundColor: '#333',
      padding: { x: 16, y: 8 }, fontFamily: 'Arial',
    }).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    skipBtn.on('pointerdown', () => this.castVote('skip'));

    this.time.addEvent({ delay: 1000, callback: this.tick, callbackScope: this, loop: true });
  }

  private buildVoterList() {
    const { width: W } = this.scale;
    const startY = 100;
    const rowH = 60;
    const cols = Math.ceil(this.voters.length / 2);
    const colW = W / 2 - 20;

    this.voteButtons = [];

    this.voters.forEach((v, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 20 + col * (colW + 20);
      const y = startY + row * rowH;

      const container = this.add.container(x, y);

      // Row background
      const bg = this.add.rectangle(0, 0, colW, 52, 0x222222).setOrigin(0, 0);
      bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, colW, 52), Phaser.Geom.Rectangle.Contains);

      // Color swatch
      const colorMap: Record<string, number> = {
        Red: 0xff2222, Blue: 0x2222ff, Green: 0x22aa22, Orange: 0xff8800,
        Yellow: 0xffff00, Black: 0x111111, Brown: 0x8b4513, Pink: 0xff69b4,
        Purple: 0x8b008b, White: 0xdddddd,
      };
      const swatch = this.add.rectangle(8, 10, 30, 30, colorMap[v.color] ?? 0x666666).setOrigin(0, 0);

      // Name
      const nameTxt = this.add.text(48, 8, v.isPlayer ? `★ ${v.name}` : v.name, {
        fontSize: '16px', color: '#ffffff', fontFamily: 'Arial',
      }).setOrigin(0, 0);

      // Voted indicator
      const votedTxt = this.add.text(colW - 8, 8, '', {
        fontSize: '14px', color: '#ffff00', fontFamily: 'Arial',
      }).setOrigin(1, 0);

      container.add([bg, swatch, nameTxt, votedTxt]);
      this.add.existing(container);

      if (!v.isPlayer) {
        bg.on('pointerdown', () => {
          if (this.phase === 'vote' && this.votedFor === null) {
            this.castVote(v.id);
          }
        });
        bg.on('pointerover', () => bg.setFillStyle(0x443322));
        bg.on('pointerout',  () => bg.setFillStyle(0x222222));
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
      this.tallyVotes();
    }
  }

  private openVoting() {
    const { width: W } = this.scale;
    this.add.text(W / 2, 60, 'Vote now!', {
      fontSize: '16px', color: '#ffcc00', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // Simulate bot votes
    this.time.delayedCall(Phaser.Math.Between(3000, 10000), () => {
      for (const v of this.voters) {
        if (!v.isPlayer && !this.votes.has(v.id)) {
          // Bots vote randomly
          const candidates = this.voters.filter(x => x.id !== v.id);
          const pick = Phaser.Math.RND.pick(candidates);
          this.votes.set(v.id, pick?.id ?? 'skip');
        }
      }
    });
  }

  private castVote(target: number | 'skip') {
    if (this.votedFor !== null || this.phase !== 'vote') return;
    this.votedFor = target;
    this.votes.set(-1, target); // player id = -1

    // Visual feedback
    const { width: W } = this.scale;
    const msg = target === 'skip' ? 'Skipped!' : `Voted for ${this.voters.find(v => v.id === target)?.name ?? '?'}`;
    this.add.text(W / 2, 80, `✓ ${msg}`, {
      fontSize: '16px', color: '#00ff88', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);
  }

  private tallyVotes() {
    if (this.phase === 'result') return;
    this.phase = 'result';

    // Ensure all bots voted
    for (const v of this.voters) {
      if (!v.isPlayer && !this.votes.has(v.id)) {
        this.votes.set(v.id, 'skip');
      }
    }

    // Count votes per candidate
    const tally = new Map<number | 'skip', number>();
    for (const target of this.votes.values()) {
      tally.set(target, (tally.get(target) ?? 0) + 1);
    }

    let maxVotes = 0;
    let ejected: number | 'skip' = 'skip';
    for (const [k, cnt] of tally) {
      if (cnt > maxVotes) { maxVotes = cnt; ejected = k; }
    }

    // Show result
    const { width: W, height: H } = this.scale;
    const ejectedVoter = ejected !== 'skip' ? this.voters.find(v => v.id === ejected) : null;
    const msg = ejectedVoter
      ? `${ejectedVoter.name} was ejected!`
      : 'No one was ejected. (Skipped)';

    this.add.rectangle(W / 2, H / 2, W * 0.7, 120, 0x000000, 0.9).setDepth(20);
    this.add.text(W / 2, H / 2 - 20, msg, {
      fontSize: '24px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(21);

    this.time.delayedCall(3000, () => {
      const ejectedId = ejected === 'skip' ? null : ejected as number;
      this.gameScene.resolveMeeting(ejectedId);
      this.scene.stop('MeetingScene');
      this.scene.resume('GameScene');
    });
  }
}
