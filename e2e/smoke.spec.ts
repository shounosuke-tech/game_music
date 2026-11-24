import { expect, test } from '@playwright/test';

test('ページが開き、エラーなくキャンバスが表示される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.locator('#app canvas')).toBeVisible();

  // スタートしてデモ画面に切り替わってもエラーが出ないこと
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyD');

  expect(errors).toEqual([]);
});
