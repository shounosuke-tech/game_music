import { expect, test, type Page } from '@playwright/test';

const scene = (page: Page) => expect(page.locator('body'));

/** ページを開き、タイトル画面がキー入力を受け付ける状態になるまで待つ */
async function openTitle(page: Page, errors: string[], query = ''): Promise<void> {
  page.on('pageerror', (err) => errors.push(err.message));
  // 手元にだけある曲があっても同じ結果になるよう、仮の曲を指定する
  await page.goto(`/?song=demo${query ? `&${query.slice(1)}` : ''}`);
  await expect(page.locator('#app canvas')).toBeVisible();
  await scene(page).toHaveAttribute('data-scene', 'title');
}

/** タイトルから曲を始め、プレイ画面になるまで待つ */
async function startPlay(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await scene(page).toHaveAttribute('data-scene', 'play', { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  // 設定は localStorage に保存されるので、テストごとに消す
  await page.addInitScript(() => localStorage.clear());
});

for (const lanes of [4, 5, 6, 7]) {
  test(`${lanes}レーンを選んで仮の曲を遊べる`, async ({ page }) => {
    const errors: string[] = [];
    await openTitle(page, errors);

    await page.keyboard.press(`Digit${lanes}`);
    await scene(page).toHaveAttribute('data-lanes', String(lanes));
    await startPlay(page);
    await scene(page).toHaveAttribute('data-lanes', String(lanes));
    await page.waitForTimeout(2500);
    for (const key of ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL']) {
      await page.keyboard.press(key);
    }

    expect(errors).toEqual([]);
  });
}

test('一時停止・再開・最初から・タイトルへ戻る', async ({ page }) => {
  const errors: string[] = [];
  await openTitle(page, errors);
  await startPlay(page);

  await page.keyboard.press('Escape');
  await scene(page).toHaveAttribute('data-scene', 'pause');
  await page.keyboard.press('Escape');
  await scene(page).toHaveAttribute('data-scene', 'play');

  await page.keyboard.press('Escape');
  await scene(page).toHaveAttribute('data-scene', 'pause');
  await page.keyboard.press('KeyR');
  await scene(page).toHaveAttribute('data-scene', 'play');

  await page.keyboard.press('Escape');
  await scene(page).toHaveAttribute('data-scene', 'pause');
  await page.keyboard.press('KeyQ');
  await scene(page).toHaveAttribute('data-scene', 'title');

  expect(errors).toEqual([]);
});

test('URL の ?lanes= で初期のレーン数を指定できる', async ({ page }) => {
  const errors: string[] = [];
  await openTitle(page, errors, '?lanes=6');
  await scene(page).toHaveAttribute('data-lanes', '6');
});

test('設定を変えると保存される', async ({ page }) => {
  const errors: string[] = [];
  await openTitle(page, errors);
  await page.keyboard.press('Digit7');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  const saved = await page.evaluate(() => localStorage.getItem('game_music:settings'));
  expect(JSON.parse(saved ?? '{}')).toMatchObject({ lastLanes: 7, judgeOffsetMs: 2 });
});
