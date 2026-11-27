// Детерминированная сверка распознанного чека. Правило 1: сумма позиций
// должна совпасть с итогом; если не совпала или итога нет — честно просим
// человека проверить. Здесь никакой магии и никакого ИИ — чистая арифметика,
// которую легко протестировать.

import type { ModelReceipt, RecognizedReceipt, ReviewReason } from './types.js';
import { round2 } from './numbers.js';

/**
 * Допуск при сравнении суммы с итогом.
 * 0.01 в валютах с копейками; для валют без дробной части (IDR) суммы целые,
 * так что 0.01 ничему не мешает. Чуть больше нуля — чтобы не придираться к
 * копеечному округлению, но ловить реальные расхождения (скидка, пропущенная позиция).
 */
const TOLERANCE = 0.01;

export function verifyReceipt(r: ModelReceipt): RecognizedReceipt {
  const reasons = new Set<ReviewReason>();

  // Валюта и дата — общие для любого типа чека.
  if (r.currency == null || r.currencyGuessed) reasons.add('currency_guessed');
  if (!r.date) reasons.add('date_not_found');
  if (r.looksPartial) reasons.add('partial_receipt');

  // --- Одна сумма (такси, перевод): позиций нет, сверять нечего ---
  if (r.kind === 'single') {
    if (r.total == null) reasons.add('total_not_found');
    return {
      ...r,
      itemsSum: null,
      totalMatches: null,
      difference: null,
      needsReview: reasons.size > 0,
      reviewReasons: [...reasons],
    };
  }

  // --- Чек с позициями ---
  const items = r.items ?? [];
  if (items.length === 0) reasons.add('no_items_found');

  // Сумма позиций = Σ сумм по строкам (amount — это уже итог строки, не цена за штуку).
  const itemsSum = round2(items.reduce((acc, it) => acc + (it.amount || 0), 0));

  let totalMatches: boolean | null = null;
  let difference: number | null = null;

  if (r.total == null) {
    reasons.add('total_not_found');
  } else {
    // Ожидаемый итог = позиции + сервисный сбор + чаевые (их делим поровну,
    // но в итог чека они входят).
    const expected = round2(itemsSum + (r.serviceCharge || 0) + (r.tip || 0));
    difference = round2(r.total - expected);
    totalMatches = Math.abs(difference) <= TOLERANCE;
    if (!totalMatches) reasons.add('sum_mismatch');
  }

  return {
    ...r,
    itemsSum,
    totalMatches,
    difference,
    needsReview: reasons.size > 0,
    reviewReasons: [...reasons],
  };
}
