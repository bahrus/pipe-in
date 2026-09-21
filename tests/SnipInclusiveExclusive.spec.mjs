import { test, expect } from '@playwright/test';
test('SnipInclusiveExclusive', async ({ page }) => {
    await page.goto('./tests/SnipInclusiveExclusive.html');
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', /.+/, { timeout: 5000 });
    const mark = await target.getAttribute('mark');
    expect(mark, mark ?? undefined).toBe('good');
});
