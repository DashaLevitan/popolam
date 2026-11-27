// Тесты чистой логики распознавания: разбор чисел по формату страны (правило 10)
// и сверка суммы позиций с итогом (правило 1). Без сети и без API.
// Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, guessNumberFormat } from './numbers.js';
import { verifyReceipt } from './verify.js';
import { normalizeModelReceipt, extractJson } from './parse-model.js';
import type { ModelReceipt, ReceiptItem } from './types.js';

// ───────────────────────── Разбор чисел ─────────────────────────

test('числа: разделитель тысяч — точка (Grab/Бали, правило 10)', () => {
  assert.equal(parseAmount('58.900', 'dot-thousands'), 58900);
  assert.equal(parseAmount('2.309', 'dot-thousands'), 2309);
  assert.equal(parseAmount('Rp 21.500', 'dot-thousands'), 21500);
});

test('числа: разделитель тысяч — пробел (рубли)', () => {
  assert.equal(parseAmount('2 900'), 2900);
  assert.equal(parseAmount('10 240'), 10240);
  assert.equal(parseAmount('1 234'), 1234); // неразрывный пробел
});

test('числа: десятичная запятая и точка', () => {
  assert.equal(parseAmount('420,50', 'dot-thousands'), 420.5); // RUB копейки
  assert.equal(parseAmount('29.00', 'comma-thousands'), 29); // USD центы
  assert.equal(parseAmount('1.234,56', 'dot-thousands'), 1234.56); // европейский
  assert.equal(parseAmount('1,234.56', 'comma-thousands'), 1234.56); // US
});

test('числа: auto угадывает — 3 цифры после точки = тысячи, иначе десятичная', () => {
  assert.equal(parseAmount('58.900', 'auto'), 58900);
  assert.equal(parseAmount('1,5', 'auto'), 1.5);
  assert.equal(parseAmount('29.00', 'auto'), 29);
  assert.equal(parseAmount('1.234.567', 'auto'), 1234567); // повтор = только тысячи
});

test('числа: мусор и пустое', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('—'), null);
  assert.equal(parseAmount('итого'), null);
  assert.equal(parseAmount(58900), 58900); // уже число — пропускаем как есть
});

test('формат по валюте: IDR/RUB — точка-тысячи, USD — запятая-тысячи', () => {
  assert.equal(guessNumberFormat('IDR'), 'dot-thousands');
  assert.equal(guessNumberFormat('RUB'), 'dot-thousands');
  assert.equal(guessNumberFormat('USD'), 'comma-thousands');
  assert.equal(guessNumberFormat('USDT'), 'comma-thousands');
  assert.equal(guessNumberFormat(null), 'auto');
});

// ───────────────────────── Сверка чека ─────────────────────────

/** Хелпер: собрать минимальный чек с позициями. */
function itemized(items: Array<[string, number, number?]>, total: number | null, extra: Partial<ModelReceipt> = {}): ModelReceipt {
  const built: ReceiptItem[] = items.map(([name, amount, quantity]) => ({
    name,
    amount,
    quantity: quantity ?? 1,
    ownerIds: [],
  }));
  return {
    kind: 'itemized',
    currency: 'RUB',
    currencyGuessed: false,
    date: '2026-11-21',
    items: built,
    total,
    serviceCharge: 0,
    tip: 0,
    guestSplitDetected: false,
    looksPartial: false,
    note: null,
    ...extra,
  };
}

test('сверка: сумма позиций сошлась с итогом (The Бык, 2 900 ₽)', () => {
  const r = verifyReceipt(itemized([['Стейк', 1200], ['Салат', 890], ['Чай', 810]], 2900));
  assert.equal(r.itemsSum, 2900);
  assert.equal(r.totalMatches, true);
  assert.equal(r.difference, 0);
  assert.equal(r.needsReview, false);
  assert.deepEqual(r.reviewReasons, []);
});

test('сверка: не сошлась — флаг sum_mismatch и needsReview (правило 1)', () => {
  const r = verifyReceipt(itemized([['Стейк', 1200], ['Салат', 890]], 2900));
  assert.equal(r.itemsSum, 2090);
  assert.equal(r.totalMatches, false);
  assert.equal(r.difference, 810);
  assert.equal(r.needsReview, true);
  assert.ok(r.reviewReasons.includes('sum_mismatch'));
});

test('сверка: сервисный сбор и чай входят в ожидаемый итог', () => {
  const r = verifyReceipt(itemized([['Паста', 1000]], 1200, { serviceCharge: 150, tip: 50 }));
  assert.equal(r.totalMatches, true);
  assert.equal(r.difference, 0);
  assert.equal(r.needsReview, false);
});

test('сверка: итога на фото нет — total_not_found (бар на АТОЛ)', () => {
  const r = verifyReceipt(itemized([['Пиво', 450], ['Орешки', 200]], null, { looksPartial: true }));
  assert.equal(r.totalMatches, null);
  assert.equal(r.needsReview, true);
  assert.ok(r.reviewReasons.includes('total_not_found'));
  assert.ok(r.reviewReasons.includes('partial_receipt'));
});

test('сверка: одна сумма (такси Grab) — позиций нет, итог берётся целиком', () => {
  const r = verifyReceipt({
    kind: 'single',
    currency: 'IDR',
    currencyGuessed: false,
    date: null, // у Grab только время поездки — правило 7
    items: [],
    total: 58900,
    serviceCharge: 0,
    tip: 0,
    guestSplitDetected: false,
    looksPartial: false,
    note: null,
  });
  assert.equal(r.itemsSum, null);
  assert.equal(r.totalMatches, null);
  assert.equal(r.needsReview, true);
  assert.ok(r.reviewReasons.includes('date_not_found'));
  assert.ok(!r.reviewReasons.includes('sum_mismatch'));
});

test('сверка: валюту угадали (MMART, рупии не напечатаны) — currency_guessed', () => {
  const r = verifyReceipt(itemized([['Вода', 15000], ['Снеки', 6500]], 21500, {
    currency: 'IDR',
    currencyGuessed: true,
    date: '2026-11-21',
  }));
  assert.equal(r.totalMatches, true);
  assert.equal(r.needsReview, true);
  assert.ok(r.reviewReasons.includes('currency_guessed'));
});

// ───────────── Разбор ответа модели (regression: баг ×100 на чеке АТОЛ) ─────────────

test('normalize: число модели НЕ портится safety-net парсером ("1 800.00" = 1800, не 180000)', () => {
  const raw = {
    kind: 'itemized',
    currency: 'RUB',
    currencyGuessed: false,
    date: '2026-11-19',
    items: [
      { name: 'Салат ростбиф', amount: 1800, quantity: 2, rawAmount: '1 800.00' },
      { name: 'dutch.Cider', amount: 850, quantity: 1, rawAmount: '850.00' },
    ],
    total: 38588,
    serviceCharge: 3508,
    tip: 0,
  };
  const m = normalizeModelReceipt(raw);
  assert.equal(m.items[0].amount, 1800); // было 180000 — вот это и чиним
  assert.equal(m.items[1].amount, 850);
  assert.equal(m.total, 38588);
  assert.equal(m.serviceCharge, 3508);
});

test('normalize: если модель вернула сумму строкой — парсим на auto ("58.900" = 58900)', () => {
  const m = normalizeModelReceipt({
    kind: 'itemized',
    items: [{ name: 'X', amount: '58.900', quantity: 1 }],
    total: '58.900',
  });
  assert.equal(m.items[0].amount, 58900);
  assert.equal(m.total, 58900);
});

test('normalize: нулевые/пустые позиции выкидываются (модификаторы по 0 — правило 4)', () => {
  const m = normalizeModelReceipt({
    kind: 'itemized',
    items: [
      { name: 'Бесплатный соус', amount: 0, quantity: 1 },
      { name: '', amount: 100, quantity: 1 },
      { name: 'Паста', amount: 1000, quantity: 1 },
    ],
  });
  assert.equal(m.items.length, 1);
  assert.equal(m.items[0].name, 'Паста');
});

test('extractJson: достаёт JSON даже из ```json ... ``` обёртки', () => {
  const obj = extractJson('бла\n```json\n{"kind":"single","total":100}\n```\nбла') as any;
  assert.equal(obj.kind, 'single');
  assert.equal(obj.total, 100);
});

test('реальный чек АТОЛ сходится при верных числах (эталон с фото от 25.11)', () => {
  // 18 позиций с фото (суммы в рублях), полная сумма 35 080, +10% сбор 3 508, итог 38 588.
  const amounts = [1800, 1800, 850, 850, 1380, 1000, 850, 450, 1700, 900, 2100, 1900, 4050, 6500, 3600, 3450, 600, 1300];
  const raw = {
    kind: 'itemized',
    currency: 'RUB',
    currencyGuessed: false,
    date: '2026-11-19',
    items: amounts.map((a, i) => ({ name: `Позиция ${i + 1}`, amount: a, quantity: 1 })),
    total: 38588,
    serviceCharge: 3508,
    tip: 0,
  };
  const r = verifyReceipt(normalizeModelReceipt(raw));
  assert.equal(r.itemsSum, 35080);
  assert.equal(r.totalMatches, true);
  assert.equal(r.needsReview, false);
});
