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
  await page.getByRole('button', { name: 'Palpagos' }).click();
  await page.getByText('Field bosses, by who beat them').click();
  await expect(page.locator('.map-frame path.map-boss').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('the progression board shows towers, story, bosses and research', async ({ page }) => {
  const problems = await open(page, '/progression', 'Progression');
  await expect(page.locator('table.tower-grid tbody tr')).not.toHaveCount(0);
  await expect(page.locator('td.tower-cell[data-normal]').first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Story stages' })).toBeVisible();
  await expect(page.locator('.map-frame path.map-boss').first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Guild research' })).toBeVisible();
  await expect(page.locator('svg[aria-label^="Level against hours"]')).toBeVisible();
  await expect(page.getByRole('list', { name: 'How this is known' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('the map shows where a Pal lives from the habitat facts', async ({ page }) => {
  const problems = await open(page, '/map?species=SheepBall', 'The islands');
  await expect(page.locator('.map-frame rect.map-habitat').first()).toBeVisible();
  await expect(page.locator('.map-caption')).toContainText('Lamball #001');
  await expect(page.locator('select[name="species"]')).toHaveValue('SheepBall');
  await page.getByRole('link', { name: 'clear' }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.locator('.map-frame rect.map-habitat')).toHaveCount(0);
  expect(problems).toEqual([]);
  const missing = await page.goto('/map?species=NotAPal');
  expect(missing?.status()).toBe(404);
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
  const palpedia = page.locator('section', { hasText: 'Palpedia' }).last();
  await expect(palpedia.locator('.palpedia-tile')).toHaveCount(288);
  await palpedia.getByRole('button', { name: /^Missing/ }).click();
  await expect(palpedia.locator('.palpedia-tile[data-caught="true"]')).toHaveCount(0);
  await palpedia.locator('a.palpedia-tile').first().click();
  await expect(page).toHaveURL(/\/map\?species=/);
  await expect(page.locator('.map-frame rect.map-habitat').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('guilds, activity, chat and the world page render', async ({ page }) => {
  let problems = await open(page, '/guilds', 'Guilds');
  await page.locator('main a.card').first().click();
  await expect(page.getByText('Members', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Caught between them')).toBeVisible();
  await expect(page.locator('.palpedia-tile')).toHaveCount(288);
  const breeding = page.locator('#breeding');
  await expect(breeding.getByRole('heading', { name: 'Breeding' })).toBeVisible();
  await expect(breeding.locator('.breeding-kept-row').first()).toBeVisible();
  await expect(breeding.locator('.pal-portrait[src]').first()).toBeVisible();
  await expect(breeding.locator('.breeding-pair').first()).toBeVisible();
  await breeding.getByLabel('Filter the Pals').fill('no such pal');
  await expect(breeding.getByText('nothing matches.')).toBeVisible();
  await breeding.getByLabel('Filter the Pals').fill('');
  await breeding.locator('select[name="target"]').selectOption('LazyDragon_Electric');
  await expect(breeding.getByText('Relaxaurus Lux hatches from')).toBeVisible();
  await expect(breeding.getByRole('list', { name: 'Wanted species' })).toBeVisible();
  expect(problems).toEqual([]);
  problems = await open(page, '/activity', 'Activity');
  await page.getByRole('link', { name: 'Progress', exact: true }).click();
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

test('the watch page shows the clock and who is on, and nothing else', async ({ page }) => {
  const problems = watchConsole(page);
  const response = await page.goto('/watch');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-watch', '');
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.locator('.sun-dial')).toBeVisible();
  const card = page.getByRole('region', { name: 'Who is on' });
  await expect(card).toContainText('4 tamers out');
  for (const name of ['Juniper', 'Orrin', 'Tamsin', 'Wren']) await expect(card).toContainText(name);
  await page.goto('/watch?show=players&limit=2');
  await expect(page.locator('.sun-dial')).toHaveCount(0);
  await expect(page.locator('.watch-players li')).toHaveCount(2);
  await expect(page.getByText('and 2 more')).toBeVisible();
  expect(problems).toEqual([]);
});
