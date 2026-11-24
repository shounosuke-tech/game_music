# game_music

ブラウザで動く、縦に落ちてくるノーツ型の音楽ゲームです（PC・キーボード操作）。

- ロードマップ：[docs/roadmap.md](docs/roadmap.md)
- 技術構成：TypeScript / Vite / PixiJS（WebGL）/ Web Audio API / Vitest / Playwright / GitHub Actions

## 必要なもの

- Node.js 26（`.nvmrc` 参照。24 以上なら動作します）

## 使い方

```sh
npm install
npm run dev        # 開発サーバーを起動（http://localhost:5173）
```

| コマンド           | 内容                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `npm run build`    | 型チェックと本番ビルド（`dist/`）                                      |
| `npm run preview`  | ビルド結果をローカルで確認                                             |
| `npm run lint`     | ESLint                                                                 |
| `npm run format`   | Prettier で整形                                                        |
| `npm test`         | 単体テスト（Vitest）                                                   |
| `npm run test:e2e` | ブラウザテスト（Playwright。初回は `npx playwright install chromium`） |

## ディレクトリ構成

```
src/
  audio/    Web Audio まわり（AudioEngine、Metronome）
  config/   レーン数・キー配置などの設定
  core/     時刻計算と判定ロジック（描画に依存しない純粋な関数。単体テスト対象）
  scenes/   画面（PixiJS のシーン）
e2e/        Playwright のテスト
docs/       ロードマップなどのドキュメント
```

## 設計の原則

- **時刻の基準は `AudioContext.currentTime` だけ。** 描画位置も判定も、音声の時刻から計算する（`src/core/clock.ts`）。
- **入力時刻は `KeyboardEvent.timeStamp` を音声の時刻に変換して判定する。** フレームの処理タイミングに左右されない。
- **ゲームロジックは `src/core` に分け、PixiJS や DOM に依存させない。** 単体テストで精度を保証する。
