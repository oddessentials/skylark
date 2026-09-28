import { expect, test, type Page } from '@playwright/test';

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || /hydration/i.test(message.text())) {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

async function open(page: Page, path: string, heading: string | RegExp): Promise<string[]> {
  const problems = watchConsole(page);
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator('main h1')).toHaveText(heading);
  await expect(page.getByText('Could not load')).toHaveCount(0);
  return problems;
}

test('today shows who is out, the running clock, the map and the latest lines', async ({
  page
}) => {
  const problems = await open(page, '/', '4 tamers out in the world');
  const roster = page.locator('section', { hasText: 'Out in the world' });
  for (const name of ['Juniper', 'Orrin', 'Tamsin', 'Wren']) {
    await expect(roster.getByRole('link', { name })).toBeVisible();
  }
  const dial = page.locator('.sun-dial');
  await expect(dial).toHaveAttribute('data-state', 'live');
  await expect(dial.getByRole('timer')).toContainText(/Day \d+/);
  await expect(dial.getByRole('timer')).toContainText(/(Nightfall|Dawn) in \d+ (min|s)/);
  await expect(page.locator('[data-clock]')).toHaveText(/^Day \d+ · \d\d:\d\d$/);
  await expect(page.locator('.map-frame svg')).toBeVisible();
  await expect(page.locator('main li[data-type]').first()).toBeVisible();
  await expect(page.getByText('live', { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(problems).toEqual([]);
});

test('the map lists the players out and the bases', async ({ page }) => {
  const problems = await open(page, '/map', 'The islands');
  await expect(page.locator('.map-frame svg')).toBeVisible();
  const onMap = page.locator('section', { hasText: 'On the map' });
  await expect(onMap.getByRole('button', { name: /Juniper/ })).toBeVisible();
  await expect(page.locator('section', { hasText: 'Bases' }).getByRole('button')).not.toHaveCount(
    0
  );
  await page.getByRole('button', { name: 'World Tree' }).click();
  await expect(page.getByRole('button', { name: 'World Tree' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(problems).toEqual([]);
});

test('players sort through the query string and open their page', async ({ page }) => {
  const problems = await open(page, '/players', 'Players');
  await expect(page.locator('main tbody tr')).not.toHaveCount(0);
  await page.getByRole('link', { name: 'Level', exact: true }).click();
  await expect(page).toHaveURL(/sort=level/);
  await page.locator('main tbody tr').first().getByRole('link').first().click();
  await expect(page.locator('main h1')).not.toHaveText('Players');
  await expect(page.getByText('Level over time')).toBeVisible();
  await expect(page.getByText('Sessions', { exact: true }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('guilds, activity, chat and the world page render', async ({ page }) => {
  let problems = await open(page, '/guilds', 'Guilds');
  await page.locator('main a.card').first().click();
  await expect(page.getByText('Members', { exact: true }).first()).toBeVisible();
  expect(problems).toEqual([]);
  problems = await open(page, '/activity', 'Activity');
  await page.getByRole('link', { name: 'Progress' }).click();
  await expect(page).toHaveURL(/types=player\.level_up/);
  await expect(page.locator('main li[data-type="player.level_up"]').first()).toBeVisible();
  expect(problems).toEqual([]);
  problems = await open(page, '/chat', 'Chat');
  await expect(page.locator('main li').first()).toBeVisible();
  expect(problems).toEqual([]);
  problems = await open(page, '/world', 'Skylark Test Server');
  await expect(page.getByText('World settings')).toBeVisible();
  await expect(page.getByText('What this site can see')).toBeVisible();
  expect(problems).toEqual([]);
});

test('the admin pages open after logging in', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel('Password').fill('anything');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('main h1')).toHaveText('Site health');
  for (const [link, heading] of [
    ['Server actions', 'Server actions'],
    ['Players', 'Players'],
    ['Raw events', 'Raw events'],
    ['Collector', 'Collector'],
    ['Settings', 'Settings']
  ] as const) {
    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: link }).click();
    await expect(page.locator('main h1')).toHaveText(heading);
  }
  expect(problems).toEqual([]);
});

test('an unknown address says nothing is on the perch', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.locator('main h1')).toHaveText('Nothing on the perch');
});
