import { Container, Graphics, Text } from 'pixi.js';
import { laneKeys } from '@/config/lanes';
import type { Judgment } from '@/core/judge';
import { clearType, scoreValue, type ClearType } from '@/core/score';
import { PlaySession, type JudgmentEvent } from '@/game/PlaySession';
import type { LoadedSong } from '@/platform/assets/songs';
import { KeyboardInput, type LaneInput } from '@/platform/input/KeyboardInput';
import { PlayfieldView } from '@/view/PlayfieldView';
import { FONT, MONO, type GameContext, type Scene } from './Scene';
import { TitleScene } from './TitleScene';

/** 開始から曲の再生までの待ち時間（秒） */
const LEAD_IN = 1.5;
/** 最後のノーツのあと、リザルトを出すまでの時間（秒） */
const OUTRO = 1.5;
/** 判定表示が消えるまでの時間（秒） */
const JUDGMENT_DISPLAY = 0.6;

const JUDGMENT_COLOR: Record<Judgment, number> = {
  perfect: 0x7df9ff,
  great: 0x8cff8c,
  good: 0xffe066,
  miss: 0xff6b6b,
};

const CLEAR_LABEL: Record<ClearType, string> = {
  failed: 'FAILED',
  cleared: 'CLEAR',
  fullCombo: 'FULL COMBO',
  allPerfect: 'ALL PERFECT',
};

type State = 'play' | 'pause' | 'result';

/** プレイ画面。一時停止と簡易リザルトを含む（本来のリザルト画面は Phase 4） */
export class PlayScene implements Scene {
  readonly root = new Container();
  private readonly session: PlaySession;
  private readonly view: PlayfieldView;
  private readonly input: KeyboardInput;
  private readonly songStart: number;
  private state: State = 'play';

  private readonly hud = new Graphics();
  private readonly scoreText = new Text({
    text: '0',
    style: { fill: 0xf5f7fa, fontSize: 28, fontFamily: MONO, fontWeight: '700' },
  });
  private readonly comboText = new Text({
    text: '',
    style: { fill: 0xf5f7fa, fontSize: 44, fontFamily: FONT, fontWeight: '800' },
  });
  private readonly judgmentText = new Text({
    text: '',
    style: { fill: 0xffffff, fontSize: 34, fontFamily: FONT, fontWeight: '800' },
  });
  private readonly timingText = new Text({
    text: '',
    style: { fill: 0xffffff, fontSize: 16, fontFamily: FONT, fontWeight: '700' },
  });
  private readonly infoText = new Text({
    text: '',
    style: { fill: 0x9aa4b2, fontSize: 13, fontFamily: MONO },
  });
  private readonly overlay = new Graphics();
  private readonly overlayText = new Text({
    text: '',
    style: { fill: 0xf5f7fa, fontSize: 22, align: 'center', fontFamily: FONT, lineHeight: 34 },
  });

  private lastJudgmentAt = -Infinity;
  private deltaSum = 0;
  private deltaCount = 0;
  private width = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly song: LoadedSong,
  ) {
    const { chart } = song;
    this.session = new PlaySession(chart, { onJudgment: (e) => this.onJudgment(e) });
    this.view = new PlayfieldView(chart, this.session);
    this.input = new KeyboardInput(ctx.engine, laneKeys(chart.lanes), (i) => this.onLaneInput(i));

    for (const t of [this.comboText, this.judgmentText, this.timingText, this.overlayText]) {
      t.anchor.set(0.5);
    }
    this.scoreText.anchor.set(1, 0);
    this.overlay.visible = false;
    this.overlayText.visible = false;
    this.root.addChild(
      this.view,
      this.hud,
      this.scoreText,
      this.comboText,
      this.judgmentText,
      this.timingText,
      this.infoText,
      this.overlay,
      this.overlayText,
    );

    this.songStart = ctx.engine.playSong(song.buffer, ctx.engine.now + LEAD_IN);
    this.input.attach();
    window.addEventListener('keydown', this.onControlKey);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    ctx.report('play', { lanes: String(chart.lanes) });
  }

  /** 判定用の曲時刻 */
  private judgeTime(audioTime: number): number {
    return audioTime - this.songStart - this.ctx.settings.judgeOffsetMs / 1000;
  }

  /** 表示用の曲時刻 */
  private displayTime(audioTime: number): number {
    return audioTime - this.songStart - this.ctx.settings.visualOffsetMs / 1000;
  }

  update(): void {
    const now = this.ctx.engine.now;
    if (this.state === 'play') {
      this.session.update(this.judgeTime(now));
      if (this.session.isComplete && this.judgeTime(now) > this.song.chart.endTime + OUTRO) {
        this.showResult();
      }
    }

    const layout = this.view.currentLayout;
    const pxPerSec = (this.ctx.settings.scrollSpeed * layout.judgeLineY) / 3;
    this.view.render(this.displayTime(now), pxPerSec, (lane) => this.input.isPressed(lane));
    this.updateHud(now);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.view.resize(width, height);
    const { left, laneWidth, judgeLineY } = this.view.currentLayout;
    const center = left + (laneWidth * this.song.chart.lanes) / 2;
    this.comboText.position.set(center, judgeLineY - 230);
    this.judgmentText.position.set(center, judgeLineY - 160);
    this.timingText.position.set(center, judgeLineY - 128);
    this.scoreText.position.set(width - 24, 16);
    this.infoText.position.set(16, 16);
    this.overlayText.position.set(width / 2, height / 2);
    this.overlay.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.72 });
  }

  destroy(): void {
    this.input.detach();
    window.removeEventListener('keydown', this.onControlKey);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.root.destroy({ children: true });
  }

  private updateHud(now: number): void {
    const score = this.session.score;
    this.scoreText.text = scoreValue(score).toString().padStart(7, '0');
    this.comboText.text = score.combo >= 2 ? String(score.combo) : '';

    const age = now - this.lastJudgmentAt;
    const alpha = this.ctx.engine.isPaused ? 1 : Math.max(0, 1 - age / JUDGMENT_DISPLAY);
    this.judgmentText.alpha = alpha;
    this.timingText.alpha = alpha;

    // クリアゲージ（プレイフィールドの右）と曲の進み具合（上）
    const { left, laneWidth, judgeLineY } = this.view.currentLayout;
    const gx = left + laneWidth * this.song.chart.lanes + 20;
    const gh = Math.min(320, judgeLineY - 40);
    const gy = judgeLineY - gh;
    const ratio = score.gauge / 100;
    const progress = Math.min(1, Math.max(0, this.judgeTime(now) / this.song.chart.endTime));
    this.hud
      .clear()
      .rect(gx, gy, 12, gh)
      .fill({ color: 0x1b2230 })
      .rect(gx, gy + gh * (1 - ratio), 12, gh * ratio)
      .fill({ color: score.gauge >= 70 ? 0x8cff8c : 0x66b3ff })
      .rect(gx - 3, gy + gh * 0.3, 18, 2)
      .fill({ color: 0xffffff })
      .rect(0, 0, this.width * progress, 3)
      .fill({ color: 0x66b3ff });

    const c = score.counts;
    this.infoText.text = [
      `${this.song.info.title}  ${this.song.chart.lanes}K`,
      `P ${c.perfect}  G ${c.great}  g ${c.good}  M ${c.miss}`,
      `FAST ${score.fast}  SLOW ${score.slow}`,
      `判定オフセット ${this.ctx.settings.judgeOffsetMs}ms  速さ ${this.ctx.settings.scrollSpeed.toFixed(1)}`,
    ].join('\n');
  }

  private onJudgment(e: JudgmentEvent): void {
    this.lastJudgmentAt = this.ctx.engine.now;
    this.judgmentText.text = e.judgment.toUpperCase();
    this.judgmentText.style.fill = JUDGMENT_COLOR[e.judgment];
    const offBeat = (e.judgment === 'great' || e.judgment === 'good') && e.delta !== null;
    this.timingText.text = offBeat ? (e.delta! < 0 ? 'FAST' : 'SLOW') : '';
    this.timingText.style.fill = e.delta !== null && e.delta < 0 ? 0x66b3ff : 0xff9f66;
    if (e.judgment !== 'miss' && e.delta !== null && e.part === 'head') {
      this.deltaSum += e.delta;
      this.deltaCount++;
    }
  }

  private onLaneInput(i: LaneInput): void {
    if (this.state !== 'play') return;
    const t = this.judgeTime(i.audioTime);
    if (i.type === 'down') this.session.press(i.lane, t);
    else this.session.release(i.lane, t);
  }

  private readonly onControlKey = (e: KeyboardEvent): void => {
    if (this.state === 'play') {
      if (e.code === 'Escape') void this.pause();
      return;
    }
    if (this.state === 'pause') {
      if (e.code === 'Escape') void this.resume();
      else if (e.code === 'KeyR') void this.retry();
      else if (e.code === 'KeyQ') void this.quit();
      return;
    }
    if (e.code === 'Enter') void this.quit();
    else if (e.code === 'KeyR') void this.retry();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.state === 'play') void this.pause();
  };

  private async pause(): Promise<void> {
    // 押しているキーを離したことにしてから止める（ロングノーツが押されっぱなしにならないように）
    this.input.releaseAll();
    this.state = 'pause';
    this.showOverlay('一時停止\n\nEsc：再開　　R：最初から　　Q：タイトルへ');
    this.ctx.report('pause', { lanes: String(this.song.chart.lanes) });
    await this.ctx.engine.pause();
  }

  private async resume(): Promise<void> {
    await this.ctx.engine.unpause();
    this.hideOverlay();
    this.state = 'play';
    this.ctx.report('play', { lanes: String(this.song.chart.lanes) });
  }

  private async retry(): Promise<void> {
    this.ctx.engine.stopSong();
    await this.ctx.engine.unpause();
    this.ctx.show(new PlayScene(this.ctx, this.song));
  }

  private async quit(): Promise<void> {
    this.ctx.engine.stopSong();
    await this.ctx.engine.unpause();
    this.ctx.show(new TitleScene(this.ctx));
  }

  private showResult(): void {
    this.state = 'result';
    this.input.detach();
    const s = this.session.score;
    const mean = this.deltaCount > 0 ? (this.deltaSum / this.deltaCount) * 1000 : 0;
    const sign = (v: number) => (v >= 0 ? '+' : '');
    const lean = Math.abs(mean) < 3 ? 'ほぼ中央' : mean > 0 ? '遅め' : '早め';
    const suggested = Math.round(this.ctx.settings.judgeOffsetMs + mean);
    this.showOverlay(
      [
        CLEAR_LABEL[clearType(s)],
        '',
        `SCORE  ${scoreValue(s).toString().padStart(7, '0')}`,
        `MAX COMBO  ${s.maxCombo}`,
        `PERFECT ${s.counts.perfect}　GREAT ${s.counts.great}　GOOD ${s.counts.good}　MISS ${s.counts.miss}`,
        `FAST ${s.fast}　SLOW ${s.slow}`,
        '',
        `平均のずれ ${sign(mean)}${mean.toFixed(1)}ms（${lean}）`,
        `判定オフセットの目安 ${sign(suggested)}${suggested}ms（現在 ${this.ctx.settings.judgeOffsetMs}ms）`,
        '',
        'Enter：タイトルへ　　R：もう一度',
      ].join('\n'),
    );
    this.ctx.report('result', { lanes: String(this.song.chart.lanes) });
  }

  private showOverlay(text: string): void {
    this.overlay.visible = true;
    this.overlayText.visible = true;
    this.overlayText.text = text;
  }

  private hideOverlay(): void {
    this.overlay.visible = false;
    this.overlayText.visible = false;
  }
}
