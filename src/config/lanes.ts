/** レーン数ごとのキー配置。上位モード（6 / 7 レーン）は Phase 2 の前に確定する。 */
export const LANE_KEYS = {
  4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
} as const satisfies Record<number, readonly string[]>;

export type LaneMode = keyof typeof LANE_KEYS;

/** 画面に表示するキーの名前 */
export function keyLabel(code: string): string {
  return code.replace(/^Key/, '');
}
