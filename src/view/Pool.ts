import type { Container } from 'pixi.js';

/**
 * 描画オブジェクトの使い回し（詳細設計書 7.3）。
 * 毎フレーム begin() → 必要な数だけ next() → end() の順に呼ぶ。
 * end() で、そのフレームに使わなかったものを非表示にする。
 */
export class Pool<T extends Container> {
  private readonly items: T[] = [];
  private used = 0;

  constructor(
    private readonly parent: Container,
    private readonly create: () => T,
    initialSize: number,
  ) {
    for (let i = 0; i < initialSize; i++) this.grow();
  }

  begin(): void {
    this.used = 0;
  }

  next(): T {
    if (this.used >= this.items.length) {
      if (import.meta.env.DEV) {
        console.warn(`Pool: 足りなくなったので追加します（${this.items.length + 1} 個目）`);
      }
      this.grow();
    }
    const item = this.items[this.used++]!;
    item.visible = true;
    return item;
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false;
  }

  get size(): number {
    return this.items.length;
  }

  private grow(): void {
    const item = this.create();
    item.visible = false;
    this.parent.addChild(item);
    this.items.push(item);
  }
}
