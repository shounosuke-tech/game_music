import { Container, Text } from 'pixi.js';
import { isLaneMode, keyLabel, laneKeys } from '@/config/lanes';
import { loadSong, loadSongList, type SongInfo } from '@/platform/assets/songs';
import { PlayScene } from './PlayScene';
import { FONT, type GameContext, type Scene } from './Scene';

/**
 * タイトル画面（Phase 2 の仮）。
 * 曲・レーン数・ノーツの速さ・判定オフセットを選んで始める。
 * 本来の曲選択画面などは Phase 4 で作る。
 */
export class TitleScene implements Scene {
  readonly root = new Container();
  private readonly text = new Text({
    text: '',
    style: { fill: 0xf5f7fa, fontSize: 22, align: 'center', fontFamily: FONT, lineHeight: 34 },
  });
  private songs: SongInfo[] = [];
  private songIndex = 0;
  private busy = true;
  private message = '';

  constructor(private readonly ctx: GameContext) {
    this.text.anchor.set(0.5);
    this.root.addChild(this.text);
    this.refresh();
    window.addEventListener('keydown', this.onKeyDown);
    void this.loadList();
  }

  update(): void {}

  resize(width: number, height: number): void {
    this.text.position.set(width / 2, height / 2);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.destroy({ children: true });
  }

  private get song(): SongInfo | undefined {
    return this.songs[this.songIndex];
  }

  private async loadList(): Promise<void> {
    try {
      this.songs = await loadSongList();
      const saved = this.songs.findIndex((s) => s.id === this.ctx.settings.lastSongId);
      this.songIndex = Math.max(0, saved);
      this.busy = false;
      this.message = '';
    } catch (err) {
      this.message = `\n曲一覧を読み込めませんでした: ${err instanceof Error ? err.message : String(err)}`;
    }
    this.refresh();
    this.reportState();
  }

  private reportState(): void {
    this.ctx.report('title', {
      lanes: String(this.ctx.settings.lastLanes),
      song: this.song?.id ?? '',
    });
  }

  private refresh(): void {
    const s = this.ctx.settings;
    const keys = laneKeys(s.lastLanes).map(keyLabel).join(' ');
    const offset = `${s.judgeOffsetMs >= 0 ? '+' : ''}${s.judgeOffsetMs}ms`;
    const song = this.song;
    const notes = [song?.local ? 'ローカル専用' : '', song?.autoChart ? '自動生成の仮譜面' : '']
      .filter(Boolean)
      .join('・');
    const songLine = song
      ? `曲　${song.title}${song.artist ? ` / ${song.artist}` : ''}${notes ? `（${notes}）` : ''}　… Tab`
      : '曲　読み込み中…';
    this.text.text = [
      'game_music（Phase 2 試作）',
      '',
      songLine,
      `レーン数　${s.lastLanes}（${keys}）　… 数字キー 4〜7`,
      `ノーツの速さ　${s.scrollSpeed.toFixed(1)}　… ↑ ↓（Shift で 1.0 ずつ）`,
      `判定オフセット　${offset}　… ← →（Shift で 10ms ずつ）`,
      '',
      this.busy ? '読み込み中…' : 'Enter キーでスタート',
      this.message,
    ].join('\n');
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.busy) return;
    const s = this.ctx.settings;
    const n = Number(e.key);
    if (isLaneMode(n)) {
      this.ctx.updateSettings({ lastLanes: n });
    } else if (e.code === 'Tab' && this.songs.length > 0) {
      const dir = e.shiftKey ? -1 : 1;
      this.songIndex = (this.songIndex + dir + this.songs.length) % this.songs.length;
      this.ctx.updateSettings({ lastSongId: this.song!.id });
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
    this.reportState();
  };

  private async start(): Promise<void> {
    const song = this.song;
    if (!song) return;
    this.busy = true;
    this.message = '';
    this.refresh();
    this.ctx.report('loading');
    try {
      // 自動再生制限のため、音声はユーザー操作の中で有効にする
      await this.ctx.engine.resume();
      const loaded = await loadSong(this.ctx.engine, song.id, this.ctx.settings.lastLanes);
      this.ctx.show(new PlayScene(this.ctx, loaded));
    } catch (err) {
      console.error(err);
      this.busy = false;
      this.message = `\n読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`;
      this.refresh();
      this.ctx.report('error');
    }
  }
}
