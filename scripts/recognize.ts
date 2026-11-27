// Прогонялка распознавания: берёт фото чека, зовёт recognizeReceipt и печатает
// результат по-человечески, с флагами «нужна проверка».
//
// Запуск:
//   npm run recognize -- path/to/photo.jpg
//   npm run recognize -- --currency=IDR grab.png             (подсказать валюту поездки)
//   npm run recognize -- page1.jpg page2.jpg                 (длинный чек = несколько фото ОДНОГО чека)
//
// Нужен ключ в ANTHROPIC_API_KEY (берётся из .env в корне или из окружения).

import { readFileSync, existsSync } from 'node:fs';
import { recognizeReceipt } from '../src/lib/receipt/index.js';
import type { RecognizedReceipt } from '../src/lib/receipt/index.js';

// ── крошечный загрузчик .env (без зависимостей) ──
function loadEnv(path = '.env'): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ── разбор аргументов ──
function parseArgs(argv: string[]): { files: string[]; currency: string | null } {
  const files: string[] = [];
  let currency: string | null = null;
  for (const a of argv) {
    if (a.startsWith('--currency=')) currency = a.slice('--currency='.length);
    else if (!a.startsWith('--')) files.push(a);
  }
  return { files, currency };
}

const USAGE = `
Прогонялка распознавания чека.

  npm run recognize -- <фото> [<фото>...] [--currency=КОД]

Примеры:
  npm run recognize -- cheque.jpg
  npm run recognize -- --currency=IDR grab.png
  npm run recognize -- page1.jpg page2.jpg     (несколько фото ОДНОГО длинного чека)

Ключ: положи ANTHROPIC_API_KEY в файл .env рядом или в переменную окружения.
`.trim();

// ── красивый вывод ──
const money = (n: number | null, cur: string | null) =>
  n == null ? '—' : `${n.toLocaleString('ru-RU')}${cur ? ' ' + cur : ''}`;

function printReceipt(r: RecognizedReceipt): void {
  const cur = r.currency;
  console.log('\n─────────── РЕЗУЛЬТАТ ───────────');
  console.log(`Тип:     ${r.kind === 'single' ? 'одна сумма (такси/перевод — делим целиком)' : 'с позициями (делим по людям)'}`);
  console.log(`Валюта:  ${cur ?? '—'}${r.currencyGuessed ? '  ⚠ угадана, подтвердить' : ''}`);
  console.log(`Дата:    ${r.date ?? '— (не нашли, нужна для курса)'}`);

  if (r.items.length) {
    console.log('\nПозиции:');
    for (const it of r.items) {
      const qty = it.quantity > 1 ? ` ×${it.quantity}` : '';
      const guest = it.guestLabel ? `  [${it.guestLabel}]` : '';
      console.log(`  • ${it.name}${qty} — ${money(it.amount, cur)}${guest}`);
    }
    console.log(`\nСумма позиций: ${money(r.itemsSum, cur)}`);
  }
  if (r.serviceCharge) console.log(`Сервисный сбор: ${money(r.serviceCharge, cur)} (поровну)`);
  if (r.tip) console.log(`Чаевые: ${money(r.tip, cur)} (поровну)`);
  console.log(`Итог чека: ${money(r.total, cur)}`);

  if (r.totalMatches === true) console.log('Сверка:  ✅ сумма сошлась с итогом');
  else if (r.totalMatches === false) console.log(`Сверка:  ❌ НЕ сошлась, расхождение ${money(r.difference, cur)}`);
  else console.log('Сверка:  — проверить нельзя (нет итога или позиций)');

  if (r.note) console.log(`Заметка: ${r.note}`);

  if (r.needsReview) {
    const human: Record<string, string> = {
      total_not_found: 'итога не видно — доснять чек или ввести вручную',
      sum_mismatch: 'сумма позиций не сошлась с итогом',
      currency_guessed: 'валюту угадали — подтвердить',
      date_not_found: 'дату не нашли — нужна для курса',
      no_items_found: 'позиций не распознано',
      partial_receipt: 'чек обрезан/перекрыт — возможно, не все позиции',
    };
    console.log('\n⚠ НУЖНА ПРОВЕРКА:');
    for (const reason of r.reviewReasons) console.log(`   - ${human[reason] ?? reason}`);
  } else {
    console.log('\n✅ Всё чисто, проверять нечего.');
  }
  console.log('─────────────────────────────────\n');
}

async function main(): Promise<void> {
  loadEnv();
  const { files, currency } = parseArgs(process.argv.slice(2));

  if (files.length === 0) {
    console.log(USAGE);
    return;
  }
  for (const f of files) {
    if (!existsSync(f)) {
      console.error(`Файл не найден: ${f}`);
      process.exit(1);
    }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Нет ключа. Положи ANTHROPIC_API_KEY в .env рядом со скриптом или в окружение.');
    process.exit(1);
  }

  console.log(`Распознаю ${files.length} фото${files.length > 1 ? ' (как один чек)' : ''}...`);
  const images = files.map((f) => readFileSync(f));
  const result = await recognizeReceipt({ images, currencyHint: currency });
  printReceipt(result);
}

main().catch((e) => {
  console.error('Ошибка:', e instanceof Error ? e.message : e);
  process.exit(1);
});
