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
    this.add.text(W / 2, 28, '🚨  EMERGENCY MEETING  🚨', {
      fontSize: '28px', color: '#ff4444', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 70, 'Discussion…', {
      fontSize: '20px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // Timer
    this.timerText = this.add.text(W - 20, 28, `${this.discussTime}s`, {
      fontSize: '26px', color: '#ffff00', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(1, 0);

    // Voter list — single column for portrait
    this.buildVoterList();

    // Skip button — large touch target
    const skipBtn = this.add.text(W / 2, H - 30, '⏭  Skip Vote', {
      fontSize: '24px', color: '#aaaaaa', backgroundColor: '#333',
      padding: { x: 24, y: 14 }, fontFamily: 'Arial',
    }).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    skipBtn.on('pointerdown', () => this.castVote('skip'));

    this.time.addEvent({ delay: 1000, callback: this.tick, callbackScope: this, loop: true });
  }

  private buildVoterList() {
    const { width: W } = this.scale;
    const startY = 108;
    const rowH = 72;                   // taller rows — easy touch targets
    const rowW = W - 32;               // single column, full-width minus margins

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

      // Row background
      const bg = this.add.rectangle(0, 0, rowW, rowH - 6, 0x222222).setOrigin(0, 0);
      bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, rowW, rowH - 6), Phaser.Geom.Rectangle.Contains);

      // Color swatch
      const swatch = this.add.rectangle(12, (rowH - 6) / 2 - 18, 36, 36, colorMap[v.color] ?? 0x666666).setOrigin(0, 0);

      // Name — larger font
      const nameTxt = this.add.text(60, 12, v.isPlayer ? `★ ${v.name}` : v.name, {
        fontSize: '22px', color: '#ffffff', fontFamily: 'Arial', fontStyle: v.isPlayer ? 'bold' : 'normal',
      }).setOrigin(0, 0);

      // Sub-label (You / Bot)
      const subTxt = this.add.text(60, 38, v.isPlayer ? 'You' : 'Crewmate', {
        fontSize: '14px', color: '#888888', fontFamily: 'Arial',
      }).setOrigin(0, 0);

      // Voted indicator
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
      this.tallyVotes();
    }
  }

  private openVoting() {
    const { width: W } = this.scale;
    // Replace "Discussion…" label with vote prompt
    this.add.text(W / 2, 70, 'Vote now!', {
      fontSize: '20px', color: '#ffcc00', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Simulate bot votes
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

  private castVote(target: number | 'skip') {
    if (this.votedFor !== null || this.phase !== 'vote') return;
    this.votedFor = target;
    this.votes.set(-1, target);

    const { width: W } = this.scale;
    const msg = target === 'skip' ? 'Skipped!' : `Voted for ${this.voters.find(v => v.id === target)?.name ?? '?'}`;
    this.add.text(W / 2, 70, `✓ ${msg}`, {
      fontSize: '18px', color: '#00ff88', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
  }

  private tallyVotes() {
    if (this.phase === 'result') return;
    this.phase = 'result';

    for (const v of this.voters) {
      if (!v.isPlayer && !this.votes.has(v.id)) {
        this.votes.set(v.id, 'skip');
      }
    }

    const tally = new Map<number | 'skip', number>();
    for (const target of this.votes.values()) {
      tally.set(target, (tally.get(target) ?? 0) + 1);
    }

    let maxVotes = 0;
    let ejected: number | 'skip' = 'skip';
    for (const [k, cnt] of tally) {
      if (cnt > maxVotes) { maxVotes = cnt; ejected = k; }
    }

    const { width: W, height: H } = this.scale;
    const ejectedVoter = ejected !== 'skip' ? this.voters.find(v => v.id === ejected) : null;
    const msg = ejectedVoter
      ? `${ejectedVoter.name} was ejected!`
      : 'No one was ejected. (Skipped)';

    this.add.rectangle(W / 2, H / 2, W * 0.85, 140, 0x000000, 0.9).setDepth(20);
    this.add.text(W / 2, H / 2, msg, {
      fontSize: '28px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
      align: 'center', wordWrap: { width: W * 0.8 },
    }).setOrigin(0.5).setDepth(21);

    this.time.delayedCall(3000, () => {
      const ejectedId = ejected === 'skip' ? null : ejected as number;
      this.gameScene.resolveMeeting(ejectedId);
      this.scene.stop('MeetingScene');
      this.scene.resume('GameScene');
    });
  }
}
