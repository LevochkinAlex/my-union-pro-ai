#!/usr/bin/env node
/**
 * Проверка доступности маршрутов дашборда (в т.ч. RSC).
 * Используется для диагностики 503 на _rsc-запросах.
 *
 * Запуск:
 *   node scripts/check-dashboard-routes.mjs
 *   BASE_URL=https://myunion.pro node scripts/check-dashboard-routes.mjs
 *
 * См. docs/503-DEBUG.md
 */

const BASE_URL = process.env.BASE_URL || 'https://myunion.pro';

const ROUTES = [
  { path: '/dashboard', name: 'Dashboard (главная)' },
  { path: '/dashboard/discounts', name: 'Dashboard / Скидки' },
  { path: '/dashboard/appeals', name: 'Dashboard / Обращения' },
  { path: '/dashboard/documents', name: 'Dashboard / Документы' },
  { path: '/dashboard/profile', name: 'Dashboard / Профиль' },
  { path: '/dashboard/chat', name: 'Dashboard / Чат' },
  { path: '/dashboard/notifications', name: 'Dashboard / Уведомления' },
];

async function fetchWithTiming(url, options = {}) {
  const start = Date.now();
  let res;
  try {
    res = await fetch(url, {
      redirect: 'manual',
      ...options,
    });
  } catch (e) {
    return { status: 0, time: Date.now() - start, error: e.message };
  }
  const time = Date.now() - start;
  return { status: res.status, time, headers: Object.fromEntries(res.headers.entries()) };
}

function statusLabel(status) {
  if (status === 0) return 'ERR';
  if (status >= 200 && status < 300) return 'OK';
  if (status >= 300 && status < 400) return 'REDIRECT';
  if (status === 503) return '503';
  return String(status);
}

async function main() {
  console.log('🔍 Проверка маршрутов дашборда\n');
  console.log(`📍 BASE_URL: ${BASE_URL}\n`);
  console.log('Обычные GET (без RSC):');
  console.log('─'.repeat(70));

  for (const { path, name } of ROUTES) {
    const url = `${BASE_URL}${path}`;
    const { status, time, error } = await fetchWithTiming(url);
    const label = statusLabel(status);
    const timeStr = `${time}ms`;
    const errStr = error ? ` (${error})` : '';
    const line = `${label.padEnd(8)} ${timeStr.padStart(8)}  ${path}  ${name}${errStr}`;
    if (status === 503 || status === 0) {
      console.log('❌', line);
    } else if (status >= 500) {
      console.log('⚠️', line);
    } else {
      console.log('  ', line);
    }
  }

  console.log('\nRSC-подобный запрос (заголовок RSC: 1):');
  console.log('─'.repeat(70));

  const rscUrl = `${BASE_URL}/dashboard`;
  const rscResult = await fetchWithTiming(rscUrl, {
    headers: {
      'RSC': '1',
      'Next-Router-Prefetch': '1',
      'User-Agent': 'check-dashboard-routes/1',
    },
  });
  const rscLabel = statusLabel(rscResult.status);
  const rscLine = `${rscLabel.padEnd(8)} ${rscResult.time}ms   GET /dashboard (RSC: 1)`;
  if (rscResult.status === 503 || rscResult.status === 0) {
    console.log('❌', rscLine);
  } else {
    console.log('  ', rscLine);
  }

  console.log('\n' + '─'.repeat(70));
  const all = [...ROUTES.map(() => null), null];
  let has503 = false;
  for (const { path } of ROUTES) {
    const url = `${BASE_URL}${path}`;
    const { status } = await fetchWithTiming(url);
    if (status === 503) has503 = true;
  }
  if (rscResult.status === 503) has503 = true;
  if (has503) {
    console.log('⚠️  Обнаружены 503. Соберите логи: PM2, nginx (см. docs/503-DEBUG.md)');
  } else {
    console.log('✅ Все проверенные маршруты ответили не 503.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
