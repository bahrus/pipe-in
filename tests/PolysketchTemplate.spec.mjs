import { test, expect } from '@playwright/test';
test('PolysketchTemplate (buffer path)', async ({ page }) => {
    await page.goto('./tests/PolysketchTemplate.html');
    await page.waitForTimeout(2500);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', /.+/, { timeout: 5000 });
    const mark = await target.getAttribute('mark');
    expect(mark, mark ?? undefined).toBe('good');
});
