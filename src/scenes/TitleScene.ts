import { Container, Text } from 'pixi.js';
import { isLaneMode, keyLabel, laneKeys } from '@/config/lanes';
import { loadSong } from '@/platform/assets/songs';
import { PlayScene } from './PlayScene';
import { FONT, type GameContext, type Scene } from './Scene';

const DEMO_SONG_ID = 'demo';

/**
 * タイトル画面（Phase 2 の仮）。
 * レーン数・ノーツの速さ・判定オフセットを選び、仮の曲を始める。
 * 曲選択などの本来の画面は Phase 4 で作る。
 */
export class TitleScene implements Scene {
  readonly root = new Container();
  private readonly text = new Text({
    text: '',
    style: { fill: 0xf5f7fa, fontSize: 22, align: 'center', fontFamily: FONT, lineHeight: 34 },
  });
  private loading = false;
  private message = '';

  constructor(private readonly ctx: GameContext) {
    this.text.anchor.set(0.5);
    this.root.addChild(this.text);
    this.refresh();
    window.addEventListener('keydown', this.onKeyDown);
    ctx.report('title', { lanes: String(ctx.settings.lastLanes) });
  }

  update(): void {}

  resize(width: number, height: number): void {
    this.text.position.set(width / 2, height / 2);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.destroy({ children: true });
  }

  private refresh(): void {
    const s = this.ctx.settings;
    const keys = laneKeys(s.lastLanes).map(keyLabel).join(' ');
    const offset = `${s.judgeOffsetMs >= 0 ? '+' : ''}${s.judgeOffsetMs}ms`;
    this.text.text = [
      'game_music（Phase 2 試作）',
      '',
      `レーン数　${s.lastLanes}（${keys}）　… 数字キー 4〜7`,
      `ノーツの速さ　${s.scrollSpeed.toFixed(1)}　… ↑ ↓（Shift で 1.0 ずつ）`,
      `判定オフセット　${offset}　… ← →（Shift で 10ms ずつ）`,
      '',
      this.loading ? '読み込み中…' : 'Enter キーでスタート',
      this.message,
    ].join('\n');
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.loading) return;
    const s = this.ctx.settings;
    const n = Number(e.key);
    if (isLaneMode(n)) {
      this.ctx.updateSettings({ lastLanes: n });
      this.ctx.report('title', { lanes: String(n) });
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const step = (e.shiftKey ? 1 : 0.1) * (e.code === 'ArrowUp' ? 1 : -1);
      this.ctx.updateSettings({ scrollSpeed: s.scrollSpeed + step });
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const step = (e.shiftKey ? 10 : 1) * (e.code === 'ArrowRight' ? 1 : -1);
      this.ctx.updateSettings({ judgeOffsetMs: s.judgeOffsetMs + step });
    } else if (e.code === 'Enter') {
      void this.start();
      return;
    } else {
      return;
    }
    e.preventDefault();
    this.refresh();
  };

  private async start(): Promise<void> {
    this.loading = true;
    this.message = '';
    this.refresh();
    this.ctx.report('loading');
    try {
      // 自動再生制限のため、音声はユーザー操作の中で有効にする
      await this.ctx.engine.resume();
      const song = await loadSong(this.ctx.engine, DEMO_SONG_ID, this.ctx.settings.lastLanes);
      this.ctx.show(new PlayScene(this.ctx, song));
    } catch (err) {
      console.error(err);
      this.loading = false;
      this.message = `\n読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`;
      this.refresh();
      this.ctx.report('error');
    }
  }
}
