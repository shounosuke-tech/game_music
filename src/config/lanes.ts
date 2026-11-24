/**
 * レーン数ごとのキー配置（KeyboardEvent.code）。
 * 4〜7 レーンを可変で扱う。左右対称に並べ、奇数レーンでは中央を Space にする。
 */
export const LANE_KEYS = {
  4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
  5: ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'],
  6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
  7: ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'],
} as const satisfies Record<number, readonly string[]>;

export type LaneMode = keyof typeof LANE_KEYS;

export const LANE_MODES: readonly LaneMode[] = [4, 5, 6, 7];

export function isLaneMode(value: number): value is LaneMode {
  return (LANE_MODES as readonly number[]).includes(value);
}

export function laneKeys(mode: LaneMode): readonly string[] {
  return LANE_KEYS[mode];
}

/** 押されたキーのレーン番号。対象外のキーなら -1。 */
export function laneIndexOf(mode: LaneMode, code: string): number {
  return laneKeys(mode).indexOf(code);
}

/**
 * レーンの見た目の種類。
 * - center: 奇数レーンの中央（Space）
 * - outer / inner: 中央から外側へ向けて交互に並ぶ。端は必ず outer。
 */
export type LaneKind = 'outer' | 'inner' | 'center';

export function laneKind(mode: LaneMode, index: number): LaneKind {
  const last = mode - 1;
  if (mode % 2 === 1 && index === last / 2) return 'center';
  const fromEdge = Math.min(index, last - index);
  return fromEdge % 2 === 0 ? 'outer' : 'inner';
}

/** 画面に表示するキーの名前（KeyD → D、Space → SPACE） */
export function keyLabel(code: string): string {
  return code === 'Space' ? 'SPACE' : code.replace(/^Key/, '');
}
