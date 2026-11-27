// Превращение «сырого» JSON от модели в наш ModelReceipt. Чистая функция:
// без сети и без картинок, поэтому тестируется отдельно (как и движок расчёта).
//
// Главный принцип после теста на чеке АТОЛ (25.11): ЧИСЛА БЕРЁМ У МОДЕЛИ.
// Модель видит чек целиком и понимает формат страны ("1 800.00" = 1800 рублей).
// Наш parseAmount — только подстраховка на случай, если модель вернула сумму
// строкой, а не числом; работает на 'auto'-формате, который разбирает и рубли
// ("1 800.00"→1800), и рупии ("58.900"→58900). Жёсткие форматы по стране в этот
// путь больше не вмешиваются — именно они и дали ошибку ×100.

import { parseAmount } from './numbers.js';
import type { ModelReceipt, ReceiptItem } from './types.js';

/** Достать JSON из ответа модели, даже если он обёрнут в ```json ... ```. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('В ответе модели не найден JSON объекта чека');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Привести значение к числу: сначала доверяем числу модели, иначе парсим строку
 * в 'auto'-формате (safety-net). Никогда не кидаем — непонятное становится 0.
 */
function toNumber(value: unknown, rawStr?: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = parseAmount((rawStr ?? value) as string | number | null | undefined, 'auto');
  return parsed ?? 0;
}

export function normalizeModelReceipt(raw: any): ModelReceipt {
  const items: ReceiptItem[] = Array.isArray(raw?.items)
    ? raw.items
        .map((it: any): ReceiptItem => ({
          name: String(it?.name ?? '').trim(),
          amount: toNumber(it?.amount, it?.rawAmount),
          quantity: Math.max(1, Math.round(Number(it?.quantity) || 1)),
          rawAmount: it?.rawAmount != null ? String(it.rawAmount) : undefined,
          guestLabel: it?.guestLabel != null ? String(it.guestLabel) : undefined,
          ownerIds: [], // заполняется людьми на экране
        }))
        // модификаторы/пустые строки по 0 не считаем позициями (правило 4)
        .filter((it: ReceiptItem) => it.name !== '' && it.amount !== 0)
    : [];

  return {
    kind: raw?.kind === 'single' ? 'single' : 'itemized',
    currency: raw?.currency ?? null,
    currencyGuessed: Boolean(raw?.currencyGuessed),
    date: raw?.date ? String(raw.date) : null,
    items,
    total: raw?.total != null ? toNumber(raw.total) : null,
    serviceCharge: raw?.serviceCharge != null ? toNumber(raw.serviceCharge) : 0,
    tip: raw?.tip != null ? toNumber(raw.tip) : 0,
    guestSplitDetected: Boolean(raw?.guestSplitDetected),
    looksPartial: Boolean(raw?.looksPartial),
    note: raw?.note ? String(raw.note) : null,
  };
}
