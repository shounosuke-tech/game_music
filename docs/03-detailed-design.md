# 詳細設計書

| 項目     | 内容                                                                |
| -------- | ------------------------------------------------------------------- |
| 対象     | game_music（ブラウザ音楽ゲーム）                                    |
| 版       | 0.1（2026-11-25）                                                   |
| 関連文書 | [要件定義書](01-requirements.md) / [基本設計書](02-basic-design.md) |

「初期案」と書いた値は、Phase 2〜4 で実際に遊んで調整し、決まったらこの文書を更新する。

## 1. 用語

| 用語               | 意味                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| 音声時刻           | `AudioContext.currentTime`。秒。ゲーム内の時刻の基準                 |
| 曲時刻（songTime） | 曲の先頭を 0 とした秒。音声時刻から計算する                          |
| tick               | 譜面上の位置を表す整数。1拍 = 960 tick                               |
| 判定オブジェクト   | 判定の対象になる単位。通常ノーツは1個、ロングノーツは始点と終点の2個 |
| ずれ（delta）      | 入力の曲時刻 − ノーツの曲時刻。負なら早い、正なら遅い                |

## 2. 定数（`src/config`）

### 2.1 レーンとキー配置（実装済み：`lanes.ts`）

| レーン数 | キー（`KeyboardEvent.code`）        |
| -------- | ----------------------------------- |
| 4        | KeyD KeyF KeyJ KeyK                 |
| 5        | KeyD KeyF Space KeyJ KeyK           |
| 6        | KeyS KeyD KeyF KeyJ KeyK KeyL       |
| 7        | KeyS KeyD KeyF Space KeyJ KeyK KeyL |

レーンの種類 `laneKind(mode, index)`：奇数レーンの中央は `center`。それ以外は端からの距離が偶数なら `outer`、奇数なら `inner`。色は `outer` 白、`inner` 青、`center` オレンジ（初期案）。

### 2.2 判定幅（実装済み：`core/judge.ts`）

| 判定    | 幅（秒） |
| ------- | -------- |
| Perfect | ±0.033   |
| Great   | ±0.066   |
| Good    | ±0.100   |

## 3. core モジュール

### 3.1 clock（実装済み：`core/clock.ts`）

| 関数                                              | 内容                                               |
| ------------------------------------------------- | -------------------------------------------------- |
| `performanceToAudioTime(ms, stamp)`               | `performance.now()` 基準の時刻を音声時刻に変換する |
| `toSongTime(audioTime, songStart, offset)`        | 音声時刻を曲時刻に変換する                         |
| `noteY(noteTime, songTime, judgeLineY, pxPerSec)` | ノーツの Y 座標                                    |

### 3.2 timing（実装済み：`core/timing.ts`）

BPM と拍子の変化を含めて、tick と曲時刻を変換する。

```ts
export const TICKS_PER_BEAT = 960;

export interface BpmEvent {
  tick: number; // この位置から
  bpm: number; // この BPM になる
}

export interface TimingMap {
  tickToSeconds(tick: number): number;
  secondsToTick(seconds: number): number;
}

export function createTimingMap(bpmEvents: readonly BpmEvent[]): TimingMap;
```

- **tick にした理由：** 拍を小数で持つと、足し算を重ねるうちに誤差がたまる。960 は 2・3・4・8・16 で割り切れるので、1/32 拍（120 tick）や3連符（1/3拍 = 320 tick、1/6拍 = 160 tick）を整数で表せる。
- **計算方法：** 作成時に BPM の区間ごとの開始秒を前計算しておき、変換時は二分探索で区間を見つけてから区間内を比例計算する。どちらの方向も O(log n)。
- **条件：** `bpmEvents` は tick の昇順で、先頭は tick 0。BPM は 0 より大きい。満たさないときは例外を投げる。
- 拍子（`MeterEvent { tick, numerator, denominator }`）は小節線の表示とエディタのグリッドにだけ使い、時刻の計算には関係しない。

### 3.3 judge（実装済み：`core/judge.ts`）

| 関数                                          | 内容                                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| `judge(delta, windows)`                       | ずれから判定を返す。Good の幅より早ければ `null`（空打ち） |
| `isMissedByTime(noteTime, songTime, windows)` | 叩かれないまま Good の幅を過ぎたか                         |
| `judgeRelease(delta, windows)`                | ロングノーツの終点の判定。下記 6.3                         |

### 3.4 score（実装済み：`core/score.ts`）

**スコア（初期案）：** 満点 1,000,000 点。判定オブジェクトの総数を N として、

```math
\text{score} = \left\lfloor 1000000 \times \frac{\sum_i w(\text{judgment}_i)}{N} \right\rfloor
```

| 判定    | 重み w |
| ------- | ------ |
| Perfect | 1.0    |
| Great   | 0.7    |
| Good    | 0.3    |
| Miss    | 0      |

切り捨ては最後に1回だけ行う（途中で丸めると、全 Perfect でも 1,000,000 にならないことがある）。実装では重みの合計を整数（Perfect = 10、Great = 7、Good = 3）で持ち、最後に割る。

**コンボ：** Perfect / Great / Good で +1、Miss で 0 に戻る。最大コンボを記録する。

**クリアゲージ（初期案）：** 0〜100%。開始時 0%、曲の終了時に 70% 以上でクリア。

| 判定            | 増減        |
| --------------- | ----------- |
| Perfect / Great | + 160 ÷ N % |
| Good            | + 80 ÷ N %  |
| Miss            | − 4 %       |

全 Perfect で 160% ぶん増える計算になり、上限 100% で止まる。ノーツ数が違っても、クリアに必要な精度がほぼ同じになる。

**記録の種別：** 全判定オブジェクトが Perfect ならオールパーフェクト、Miss がなければフルコンボ（FR-18）。

```ts
export interface ScoreState {
  readonly counts: Record<Judgment, number>;
  readonly fast: number; // 早い側にずれた Great / Good の数
  readonly slow: number; // 遅い側にずれた Great / Good の数
  readonly combo: number;
  readonly maxCombo: number;
  readonly gauge: number; // 0〜100
}

export function createScore(totalObjects: number): ScoreState;
export function applyJudgment(state: ScoreState, j: Judgment, delta: number | null): ScoreState;
export function scoreValue(state: ScoreState, totalObjects: number): number;
```

`applyJudgment` は新しい状態を返す純粋関数にする（テストしやすく、リプレイ機能にも流用できる）。プレイ中の GC を避ける必要が出たら、同じ関数の中身を書き換え型に変える。

### 3.5 chart（実装済み：`core/chart/`）

譜面ファイル（4.3）を読み込み、ゲームで使う形に変換する。

```ts
export interface PlayableNote {
  readonly id: number;
  readonly lane: number;
  readonly time: number; // 曲時刻（秒）
  readonly endTime: number | null; // ロングノーツの終点（秒）。通常ノーツは null
  readonly chordId: number | null; // 同時押しのグループ。単独なら null
}

export interface PlayableChart {
  readonly lanes: LaneMode;
  readonly notes: readonly PlayableNote[]; // time の昇順、同時刻はレーン番号の昇順
  readonly totalObjects: number; // スコア計算の N
  readonly endTime: number; // 最後のノーツ（終点を含む）の時刻
}

export function parseChart(json: unknown): ChartFile; // 形式の検証。不正なら ChartError
export function buildPlayableChart(chart: ChartFile): PlayableChart;
```

**検証ルール（`parseChart`）：**

- `version` が対応している版であること
- `lanes` が 4〜7、各ノーツの `lane` が 0 以上 `lanes` 未満
- `tick` が 0 以上の整数、ロングノーツは `endTick > tick`
- 同じレーンでノーツが重ならないこと（ロングノーツの区間の中に別のノーツがない）
- エラーには、何番目のノーツが、どのルールに違反したかを含める

**同時押し：** 同じ tick にあるノーツが2個以上あれば、同じ `chordId` を付ける。ロングノーツの終点同士はグループにしない。

## 4. データ形式

すべての JSON に `version`（整数）を持たせ、形式を変えるときは版を上げて変換処理を書く。

### 4.1 曲一覧 `public/songs/index.json`

```json
{
  "version": 1,
  "songs": ["first-song", "second-song"]
}
```

### 4.2 曲情報 `public/songs/<曲ID>/song.json`

```json
{
  "version": 1,
  "id": "first-song",
  "title": "曲名",
  "artist": "作曲者名",
  "bpmLabel": "128",
  "audio": { "opus": "song.opus", "aac": "song.m4a" },
  "audioOffsetMs": { "opus": 0, "aac": 0 },
  "preview": { "startSec": 45.0, "durationSec": 15.0 },
  "jacket": "jacket.webp",
  "theme": { "background": "#0b1020", "accent": "#66b3ff" },
  "charts": [{ "difficulty": "normal", "level": 5, "lanes": 4, "file": "normal.4k.json" }]
}
```

- `audioOffsetMs`：音源の形式ごとの先頭のずれ（FR-54）。正の値で、譜面を後ろにずらす。
- `theme`：Phase 5 の前に項目を確定する。

- 音源の形式は、ブラウザが再生できるものを Opus → AAC → WAV の順に選ぶ（`pickAudioFormat`）。開発用の仮の曲（11 章）は WAV だけを持つ。

### 4.3 譜面 `public/songs/<曲ID>/<難易度>.<レーン数>k.json`

```json
{
  "version": 1,
  "lanes": 4,
  "offsetMs": 0,
  "bpm": [
    { "tick": 0, "bpm": 128 },
    { "tick": 122880, "bpm": 140 }
  ],
  "meter": [{ "tick": 0, "numerator": 4, "denominator": 4 }],
  "notes": [
    { "tick": 3840, "lane": 0 },
    { "tick": 3840, "lane": 3 },
    { "tick": 4320, "lane": 1, "endTick": 5280 }
  ]
}
```

- `offsetMs`：曲の先頭から tick 0 までの時間。
- ノーツの曲時刻 = `tickToSeconds(tick) + offsetMs / 1000 + audioOffsetMs / 1000`

### 4.4 設定（localStorage キー `game_music:settings`）

```json
{
  "version": 1,
  "scrollSpeed": 3.0,
  "judgeOffsetMs": 0,
  "visualOffsetMs": 0,
  "volume": { "music": 0.8, "effect": 0.6 },
  "keyBindings": { "4": ["KeyD", "KeyF", "KeyJ", "KeyK"] },
  "lastLanes": 4
}
```

| 項目             | 範囲                                                          | 初期値             |
| ---------------- | ------------------------------------------------------------- | ------------------ |
| `scrollSpeed`    | 0.5〜10.0（0.1刻み）                                          | 3.0                |
| `judgeOffsetMs`  | −300〜+300                                                    | 0                  |
| `visualOffsetMs` | −300〜+300                                                    | 0                  |
| `volume.*`       | 0.0〜1.0                                                      | 曲 0.8、効果音 0.6 |
| `keyBindings`    | レーン数ごとのキー配列。書かれていないレーン数は 2.1 の初期値 | なし               |

ノーツの速さ：1秒あたりの移動量 = `scrollSpeed × 判定ラインまでの距離 ÷ 3`。`scrollSpeed` が 3.0 なら、ノーツは判定ラインまで 1 秒で落ちる。画面の高さが変わっても体感の速さが変わらない。

### 4.5 記録（localStorage キー `game_music:records`）

```json
{
  "version": 1,
  "records": {
    "first-song/normal/4": {
      "bestScore": 987654,
      "maxCombo": 512,
      "clear": "fullCombo",
      "playCount": 12,
      "updatedAt": "2026-11-25T10:00:00.000Z"
    }
  }
}
```

`clear` は `failed` / `cleared` / `fullCombo` / `allPerfect` のうち最も良いものを残す。

### 4.6 保存処理の共通ルール（`platform/storage`）

1. 読み込んだ JSON の `version` を見て、古ければ順番に変換して最新にする
2. JSON として読めない・検証に通らない場合は、元のデータを `<キー>:broken:<日時>` に退避し、初期値で始める
3. localStorage が使えない環境（プライベートモードなど）では、メモリ上にだけ持ち、画面にその旨を出す

## 5. platform モジュール

### 5.1 AudioEngine（実装済み：`platform/audio/AudioEngine.ts`）

| メソッド                          | 内容                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `resume()`                        | ユーザー操作の中で呼び、音声を有効にする                                            |
| `now`                             | 音声時刻                                                                            |
| `outputTimestamp()`               | 音声時刻と `performance.now()` の対応                                               |
| `load(url)`                       | 音源を取得し、`decodeAudioData` でデコードしておく                                  |
| `playSong(buffer, at)`            | 音声時刻 `at` に曲を再生する。曲の開始時刻を返す                                    |
| `stopSong()`                      | 曲を止める                                                                          |
| `pause()` / `unpause()`           | `AudioContext.suspend()` / `resume()`。音声時刻ごと止まるので、曲時刻も自然に止まる |
| `playEffect(name, at)`（Phase 5） | 効果音を予約再生する                                                                |

音量は「曲」「効果音」それぞれの `GainNode` を、まとめ用の `GainNode` につなぐ。

再生の開始は「今 + 1.5 秒」とし、その間に最初の描画を済ませ、プレイヤーが構えられるようにする。

### 5.2 入力（実装済み：`platform/input/KeyboardInput.ts`）

- `keydown` / `keyup` を `window` で受け取る。
- `event.code` を現在のキー配置でレーン番号に変換する。対象外のキーは無視する。
- 対象のキーは `preventDefault()` する（Space でのスクロールなどを防ぐ）。
- `event.repeat` が true の `keydown`（押しっぱなしによる連続入力）は無視する。
- `event.timeStamp` を音声時刻 → 曲時刻に変換し、`{ lane, songTime, type: 'down' | 'up' }` をゲームに渡す。
- ウィンドウからフォーカスが外れたら（`blur`）、押しているキーをすべて離したことにする（ロングノーツが押されっぱなしになるのを防ぐ）。

## 6. game モジュール：プレイの進行（実装済み：`game/PlaySession.ts`）

### 6.1 データの持ち方

- ノーツはレーンごとの配列に分け、各配列に「次に判定するノーツ」の番号を持つ。判定が済んだら番号を進める。これでノーツの検索が O(1) になる。
- ノーツの状態：`waiting` → `holding`（ロングノーツの押下中）→ `done`

### 6.2 毎フレームの処理（`update(songTime)`）

1. 判定用の曲時刻 = 曲時刻 − 判定オフセット
2. 各レーンの次のノーツが `waiting` で、Good の幅を過ぎていれば Miss。ロングノーツなら終点も Miss にする
3. `holding` のロングノーツは、終点の時刻に達したら終点を Perfect にして `done` にする
4. 全ノーツが `done` で、曲時刻が曲の長さを過ぎたら終了

### 6.3 入力の処理

**押したとき（down）：**

1. そのレーンの次のノーツを取る。なければ空打ち（何もしない）
2. `judge(delta)` が `null` なら空打ち
3. 判定を記録する。通常ノーツは `done`、ロングノーツは Miss 以外なら `holding`、Miss なら終点も Miss にして `done`

**離したとき（up）：** そのレーンに `holding` のロングノーツがあれば、終点を判定する（`judgeRelease`）。

| 離した時刻（終点からのずれ） | 終点の判定                 |
| ---------------------------- | -------------------------- |
| Good の幅より早い            | Miss                       |
| Good の幅の中                | ずれに応じた判定           |
| 終点を過ぎるまで押していた   | Perfect（6.2 の 3 で処理） |

### 6.4 一時停止とリトライ

- 一時停止：`AudioEngine.pause()`。音声時刻が止まるので、プレイ側は何もしなくてよい。
- 一時停止の前に、押しているキーをすべて離したことにする（ロングノーツが押されっぱなしにならないように）。タブが裏に回ったときも一時停止する。
- 再開：`AudioEngine.unpause()` で、すぐに再開する。再開前のカウントダウン演出は Phase 5 で検討する。
- リトライ：プレイの状態を作り直し、曲を頭から再生予約する。

## 7. view モジュール：描画（実装済み：`view/PlayfieldView.ts`）

### 7.1 表示の重なり順（奥から）

1. 背景（曲ごとのテーマ）
2. レーンの地、区切り線、小節線
3. 押しているレーンの光
4. ロングノーツの帯
5. 同時押しの線
6. ノーツ
7. 判定ライン、キー表示
8. 判定の文字、コンボ、ヒットエフェクト
9. スコア、ゲージ、曲の進み具合

### 7.2 ノーツの描画

- 表示用の曲時刻 = 曲時刻 − 表示オフセット
- Y 座標は `noteY(ノーツの時刻, 表示用の曲時刻, 判定ラインの Y, 1秒あたりの移動量)`
- 画面の上端より上（まだ見えない）と、判定ラインを Good の幅より過ぎたノーツは描かない
- ロングノーツの帯は始点から終点まで描く。押している間は、始点側を判定ラインで切る
- 同時押しの線は、同じ `chordId` のノーツのうち一番左と一番右をつなぐ

### 7.3 オブジェクトの使い回し

ノーツの描画オブジェクトは、起動時にまとめて作っておき（初期案 256 個）、見えなくなったら戻して再利用する。プレイ中は新しく作らない（NFR-11）。足りなくなったら、その時点で追加で作り、開発中は警告を出す。

## 8. 判定タイミング調整（Phase 4：FR-26）

Phase 2 の時点では、リザルトに「平均のずれ」と「判定オフセットの目安」を表示し、タイトル画面で判定オフセットを手で変えられるようにしている。

1. 0.5 秒間隔のクリック音を 20 回鳴らす。プレイヤーは音に合わせて任意のキーを叩く
2. 最初の 4 回は慣れるための入力として捨てる
3. 残りのずれの中央値（外れ値に強い）を、判定オフセットの提案値として表示する
4. プレイヤーが「適用」を選んだら設定に保存する

表示オフセットは、画面上の光る線と音を同時に見せ、プレイヤーが目で合わせる方式とする（Phase 4 で詳細化）。

## 9. 譜面エディタ（Phase 3 で詳細化）

- 開発用の画面として `?editor` で開く。本番のビルドにも含めるかは Phase 3 で決める
- 機能：再生・停止・速度変更（0.25〜1.0 倍）、キーを叩いて記録、グリッド（1/4〜1/32、3連符）への吸着、ノーツの追加・削除・移動、ロングノーツの作成、BPM 変化の編集、JSON の読み込み・書き出し

## 10. テスト項目（単体テスト）

| モジュール | 主な確認内容                                                                               |
| ---------- | ------------------------------------------------------------------------------------------ |
| clock      | 時刻変換の計算、ノーツ位置の計算                                                           |
| timing     | BPM 一定・変化ありでの tick ⇔ 秒の往復、境界の tick、不正な入力で例外                      |
| judge      | 各判定幅の境界値、空打ち、見逃し、ロングノーツの終点                                       |
| score      | 全 Perfect で 1,000,000 点、各判定の配点、コンボのリセット、ゲージの上限と下限、クリア種別 |
| chart      | 検証ルールそれぞれの違反の検出、同時押しのグループ化、時刻の計算                           |
| game       | 押下・離す・見逃しの各流れ、同じレーンの連続ノーツ、ロングノーツの各パターン               |
| storage    | 版の変換、壊れたデータの退避                                                               |
| lanes      | キー配置、レーンの種類（実装済み）                                                         |
| 曲データ   | `public/songs` のすべての曲・譜面が検証に通ること（曲を追加したときの確認を兼ねる）        |

## 11. 開発用の仮の曲（実装済み：`tools/generate-demo-song.mjs`）

自作曲が用意できるまでの開発・テスト用に、仮の曲をプログラムで生成する。

- 曲：BPM 128、4/4 拍子、26 小節（約 50 秒）。ドラム・ベース・アルペジオ・リードを合成した WAV（モノラル、44.1kHz）
- 譜面：4〜7 レーンそれぞれ。4分 → 8分と同時押し → ロングノーツ → 16分の交互押し、の順に難しくなる
- 出力先：`public/songs/demo/` と `public/songs/index.json`。Git には含めず、`npm run dev` / `build` / `test` の前に自動で生成する
- 乱数の種を固定しているので、何度生成しても同じ内容になる

自作曲を追加するときは、曲一覧（4.1）の扱いを Phase 3 で見直す（生成した `index.json` と、手で管理する曲の一覧を分ける）。
