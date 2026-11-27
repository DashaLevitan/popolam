// Разбор чисел с чека с учётом формата страны. Правило 10 из контекста:
// где-то разделитель тысяч — точка ("58.900" = 58 900), где-то запятая,
// где-то пробел; десятичный разделитель — точка или запятая.
// Это safety-net: модель обычно нормализует числа сама, но на сырых строках
// (и чтобы поймать ошибку вроде "58.900" → 58.9) нам нужна своя детерминированная логика.

/**
 * Формат чисел:
 *  - 'dot-thousands'   — точка группирует тысячи, запятая десятичная: 1.234,56  (RU, ID, RS, DE)
 *  - 'comma-thousands' — запятая группирует тысячи, точка десятичная: 1,234.56  (US, UK)
 *  - 'auto'            — угадываем по самой строке (эвристика ниже)
 */
export type NumberFormat = 'dot-thousands' | 'comma-thousands' | 'auto';

/** Округление до 2 знаков без накопления ошибок float. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Валюта/страна → предполагаемый формат чисел. Для подсказки парсеру. */
export function guessNumberFormat(currencyOrCountry: string | null | undefined): NumberFormat {
  if (!currencyOrCountry) return 'auto';
  const key = currencyOrCountry.trim().toUpperCase();
  // Точка/пробел — тысячи, запятая — десятичная
  const dotThousands = new Set([
    'IDR', 'INDONESIA', 'ID',
    'RUB', 'RUSSIA', 'RU',
    'RSD', 'SERBIA', 'RS',
    'EUR', 'DE', 'GERMANY', // европейский формат
    'TRY', 'TURKEY', 'TR',
  ]);
  // Запятая — тысячи, точка — десятичная
  const commaThousands = new Set([
    'USD', 'US', 'USA',
    'GBP', 'UK', 'GB',
    'AED', 'UAE', // на чеках ОАЭ обычно 1,234.56
    'USDT', // крипта — точка десятичная
  ]);
  if (dotThousands.has(key)) return 'dot-thousands';
  if (commaThousands.has(key)) return 'comma-thousands';
  return 'auto';
}

/**
 * Разобрать строку суммы с чека в число.
 * Возвращает null, если в строке нет ни одной цифры.
 *
 * Примеры:
 *   parseAmount('58.900', 'dot-thousands') -> 58900
 *   parseAmount('2.309',  'auto')          -> 2309   (3 цифры после точки => тысячи)
 *   parseAmount('2 900',  'auto')          -> 2900
 *   parseAmount('420,50', 'dot-thousands') -> 420.5
 *   parseAmount('1.234,56','dot-thousands')-> 1234.56
 *   parseAmount('1,234.56','comma-thousands')-> 1234.56
 *   parseAmount('Rp 21.500','dot-thousands')-> 21500
 */
export function parseAmount(raw: string | number | null | undefined, format: NumberFormat = 'auto'): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  // Убираем пробелы (в т.ч. неразрывные) — это всегда разделитель тысяч.
  let s = String(raw).replace(/[\s  ]/g, '');
  // Оставляем только цифры, точку, запятую и знак минус.
  s = s.replace(/[^\d.,-]/g, '');
  if (s === '' || s === '-' || !/\d/.test(s)) return null;

  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  // Какой из разделителей десятичный (null = десятичного нет, число целое).
  let decimalSep: '.' | ',' | null = null;

  if (hasDot && hasComma) {
    // Оба есть: десятичный — тот, что правее.
    decimalSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  } else if (hasDot || hasComma) {
    const sep: '.' | ',' = hasDot ? '.' : ',';
    const occurrences = s.split(sep).length - 1;
    const digitsAfter = s.length - 1 - s.lastIndexOf(sep);

    if (occurrences > 1) {
      // Разделитель повторяется ("1.234.567") => это тысячи, десятичного нет.
      decimalSep = null;
    } else if (format === 'dot-thousands') {
      // точка — тысячи, запятая — десятичная
      decimalSep = sep === ',' ? ',' : null;
    } else if (format === 'comma-thousands') {
      // запятая — тысячи, точка — десятичная
      decimalSep = sep === '.' ? '.' : null;
    } else {
      // auto: ровно 3 цифры после одиночного разделителя — скорее тысячи
      // ("58.900"=58900), иначе десятичная ("29.00"=29, "1,5"=1.5).
      decimalSep = digitsAfter === 3 ? null : sep;
    }
  }

  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    const intPart = s.slice(0, idx).replace(/[.,]/g, '');
    const fracPart = s.slice(idx + 1).replace(/[.,]/g, '');
    const num = Number(`${intPart || '0'}.${fracPart}`);
    return Number.isNaN(num) ? null : (neg ? -num : num);
  }

  const num = Number(s.replace(/[.,]/g, ''));
  return Number.isNaN(num) ? null : (neg ? -num : num);
}
