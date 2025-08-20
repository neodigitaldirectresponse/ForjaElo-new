import { test, expect, chromium } from '@playwright/test';
test('carrega página com extensão', async () => {
  const EXT = process.env.EXT_DIR || './extension';
  const ctx = await chromium.launchPersistentContext('tmp-user', {
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const page = await ctx.newPage();
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/i);
  await ctx.close();
});
