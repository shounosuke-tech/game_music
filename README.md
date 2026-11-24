# game_music

ブラウザで動く、縦に落ちてくるノーツ型の音楽ゲームです（PC・キーボード操作）。

- 設計書類：[00 ロードマップ](docs/00-roadmap.md) / [01 要件定義書](docs/01-requirements.md) / [02 基本設計書](docs/02-basic-design.md) / [03 詳細設計書](docs/03-detailed-design.md)
- 技術構成：TypeScript / Vite / PixiJS（WebGL）/ Web Audio API / Vitest / Playwright / GitHub Actions

## 必要なもの

- Node.js 26（`.nvmrc` 参照。24 以上なら動作します）
- ffmpeg（曲を取り込むときだけ必要。Windows なら `winget install Gyan.FFmpeg`）

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

## 操作方法（Phase 2 の試作）

`npm run dev` を実行すると、開発用の仮の曲（約 50 秒）が自動で作られます。

**タイトル画面**

| キー  | 操作                                             |
| ----- | ------------------------------------------------ |
| 4〜7  | レーン数を切り替える                             |
| ↑ ↓   | ノーツの速さ（Shift を押しながらで 1.0 ずつ）    |
| ← →   | 判定オフセット（Shift を押しながらで 10ms ずつ） |
| Enter | スタート                                         |

設定はブラウザに保存されます。URL に `?lanes=6` のように付けて、最初のレーン数を指定することもできます。

**プレイ中**

| レーン数 | キー配置          |
| -------- | ----------------- |
| 4        | D F J K           |
| 5        | D F Space J K     |
| 6        | S D F J K L       |
| 7        | S D F Space J K L |

Esc で一時停止します（再開・最初から・タイトルへ）。曲が終わると、リザルトに「平均のずれ」と「判定オフセットの目安」が出るので、タイトル画面で判定オフセットを合わせてください。

## 曲の取り込み

```sh
npm run song:import -- "music/曲.mp3" --id my-song --local
```

音源を Opus と AAC に変換し、BPM と1拍目の位置を推定して、4〜7 レーンの仮の譜面を `public/songs/<曲ID>/` に作ります。結果は `analysis.json` に残ります。

- `--local`：公開しない、手元での開発・テスト専用の曲にする
- `--bpm` / `--first-beat-ms`：推定がずれているときに手で指定する
- `--charts-only`：音源の変換を飛ばして、譜面だけを作り直す

**曲データ（`public/songs/`）と元の音源（`music/`）は、既定で Git に含めません。** 公開リポジトリに権利のない音源が載らないようにするためです。公開してよい自作曲だけ、`.gitignore` に `!public/songs/<曲ID>/` を足して含めてください。

## ディレクトリ構成

```
src/
  config/     レーン数・キー配置などの定数
  core/       時刻計算・判定・スコア・譜面（描画に依存しない純粋なロジック。単体テスト対象）
  game/       プレイの進行（PlaySession）
  platform/   ブラウザの機能を包む層（audio / input / storage / assets）
  view/       PixiJS の描画部品
  scenes/     画面（タイトル・プレイ）
tools/        開発用スクリプト（仮の曲の生成）
public/songs/ 曲データ（仮の曲は自動生成され、Git には含めない）
e2e/          Playwright のテスト
docs/         設計書類（00 ロードマップ〜03 詳細設計書）
```

## 設計の原則

- **時刻の基準は `AudioContext.currentTime` だけ。** 描画位置も判定も、音声の時刻から計算する（`src/core/clock.ts`）。
- **入力時刻は `KeyboardEvent.timeStamp` を音声の時刻に変換して判定する。** フレームの処理タイミングに左右されない。
- **ゲームロジックは `src/core` に分け、PixiJS や DOM に依存させない。** 単体テストで精度を保証する。
