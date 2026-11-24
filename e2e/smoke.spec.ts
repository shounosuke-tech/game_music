import { expect, test, type Page } from '@playwright/test';

/** ページを開き、タイトル画面がキー入力を受け付ける状態になるまで待つ */
async function openTitle(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title');
}

test('Enter でスタートし、エラーなくデモ画面に切り替わる', async ({ page }) => {
  const errors: string[] = [];
  await openTitle(page, errors);
  await expect(page.locator('body')).toHaveAttribute('data-lanes', '4');

  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'play');
  await page.keyboard.press('KeyD');

  expect(errors).toEqual([]);
});

for (const lanes of [4, 5, 6, 7]) {
  test(`${lanes}レーンを選んで遊べる`, async ({ page }) => {
    const errors: string[] = [];
    await openTitle(page, errors);

    await page.keyboard.press(`Digit${lanes}`);
    await expect(page.locator('body')).toHaveAttribute('data-lanes', String(lanes));
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'play');
    for (const key of ['KeyS', 'KeyD', 'Space', 'KeyL']) await page.keyboard.press(key);

    expect(errors).toEqual([]);
  });
}

test('URL の ?lanes= で初期のレーン数を指定できる', async ({ page }) => {
  await page.goto('/?lanes=6');
  await expect(page.locator('body')).toHaveAttribute('data-lanes', '6');
});
