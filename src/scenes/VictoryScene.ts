import Phaser from 'phaser';
import { fitContain } from '../utils/imageFit';

interface VictoryData {
  winner: 'crew' | 'impostor';
  tasksDone: number;
  impostorName: string;
}

export class VictoryScene extends Phaser.Scene {
  private victoryData!: VictoryData;

  constructor() {
    super({ key: 'VictoryScene' });
  }

  init(data: VictoryData) {
    // Store in an instance variable so create() can read it without touching
    // the shared registry — prevents stale data leaking into the next session.
    this.victoryData = data;
  }

  create() {
    const data = this.victoryData;
    const { width: W, height: H } = this.scale;

    const isCrew = data.winner === 'crew';

    // Background
    this.add.rectangle(W / 2, H / 2, W, H, isCrew ? 0x001133 : 0x330011);

    // Alert image
    const imgKey = isCrew ? 'alert_victory' : 'alert_defeat';
    if (this.textures.exists(imgKey)) {
      fitContain(this.add.image(W / 2, H * 0.3, imgKey), W * 0.6, H * 0.35);
    }

    // Winner text
    const winText = isCrew ? '🏆  CREWMATES WIN!' : '💀  IMPOSTORS WIN!';
    this.add.text(W / 2, H * 0.55, winText, {
      fontSize: '40px',
      color: isCrew ? '#00ff88' : '#ff2222',
      stroke: '#000', strokeThickness: 4,
      fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Stats
    this.add.text(W / 2, H * 0.67, [
      `Tasks completed: ${data.tasksDone} / 8`,
      `Impostor: ${data.impostorName}`,
    ].join('\n'), {
      fontSize: '22px', color: '#cccccc',
      fontFamily: 'Arial', align: 'center',
    }).setOrigin(0.5);

    // Play again
    const playAgain = this.add.text(W / 2, H * 0.82, '▶  Play Again', {
      fontSize: '28px', color: '#ffffff',
      backgroundColor: '#224422',
      padding: { x: 24, y: 12 }, fontFamily: 'Arial',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playAgain.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
    playAgain.on('pointerover', () => playAgain.setAlpha(0.8));
    playAgain.on('pointerout',  () => playAgain.setAlpha(1));

    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('MenuScene'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('MenuScene'));

    // Particles / tween
    this.tweens.add({
      targets: playAgain,
      scaleX: 1.05, scaleY: 1.05,
      yoyo: true, repeat: -1, duration: 700,
    });
  }
}
