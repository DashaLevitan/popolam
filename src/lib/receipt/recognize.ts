// Вызов Claude API (vision) для распознавания чека. Это «грязная» часть: сеть,
// картинки, ключ. Разбор ответа модели — в parse-model.ts, арифметика и сверка —
// в verify.ts (обе тестируются без API).
//
// Решения по стоимости (см. раздел 7.2 контекста проекта):
//  - модель Haiku-класса (не Opus): чтение чека — простая задача;
//  - фото ужимаем до ~1200px по длинной стороне ПЕРЕД отправкой (главная экономия токенов);
//  - системный промпт кэшируем (cache_control) — повторная отправка в разы дешевле;
//  - ключ берётся из окружения (.env на сервере), в браузер/Mini App не попадает.

import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { RECEIPT_SYSTEM_PROMPT } from './prompt.js';
import { verifyReceipt } from './verify.js';
import { extractJson, normalizeModelReceipt } from './parse-model.js';
import type { RecognizedReceipt } from './types.js';

/** Модель для распознавания. Меняется в одном месте / через env. */
const MODEL = process.env.RECEIPT_MODEL ?? 'claude-haiku-4-5';

/**
 * Максимальная длинная сторона фото в пикселях перед отправкой.
 * 1568 — «родной» оптимум зрения модели (дальше она сама ужимает, смысла слать
 * больше нет). На длинных чеках важно: каждой строке достаётся больше пикселей,
 * цифры не «мылятся». По токенам почти бесплатно против 1200.
 */
const MAX_IMAGE_SIDE = 1568;

/** Потолок на ответ: JSON чека короткий, незачем платить за лишнее. */
const MAX_OUTPUT_TOKENS = 1500;

export interface RecognizeOptions {
  /** Один или несколько снимков ОДНОГО чека (длинный чек = несколько фото). */
  images: Buffer[];
  /** Подсказка по валюте поездки, если известна. Необязательно. */
  currencyHint?: string | null;
  /** Своя реализация клиента (для тестов). По умолчанию создаётся из env. */
  client?: Anthropic;
}

/** Ужать и перекодировать фото в JPEG, чтобы не жечь токены на мегапиксели. */
async function downscale(image: Buffer): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  const out = await sharp(image)
    .rotate() // учесть EXIF-ориентацию (фото с телефона часто повёрнуты)
    .resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { base64: out.toString('base64'), mediaType: 'image/jpeg' };
}

/**
 * Распознать чек по одному или нескольким фото.
 * Возвращает распознанное + результат сверки (needsReview, reviewReasons).
 */
export async function recognizeReceipt(opts: RecognizeOptions): Promise<RecognizedReceipt> {
  const { images, currencyHint } = opts;
  if (!images?.length) throw new Error('recognizeReceipt: нет ни одного фото');

  const client = opts.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const downscaled = await Promise.all(images.map(downscale));

  const imageBlocks = downscaled.map((img) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 },
  }));

  const userText =
    currencyHint && currencyHint.trim()
      ? `Валюта поездки: ${currencyHint}. Если на чеке другая — верни ту, что на чеке.`
      : 'Определи валюту по чеку.';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: 'text',
        text: RECEIPT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // кэшируем промпт с правилами
      },
    ],
    messages: [
      {
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: userText }],
      },
    ],
  });

  const textPart = response.content.find((c) => c.type === 'text');
  if (!textPart || textPart.type !== 'text') throw new Error('Модель не вернула текстовый ответ');

  const model = normalizeModelReceipt(extractJson(textPart.text));
  return verifyReceipt(model);
}
