// HTTP-сервер приложения. Пока один эндпоинт — распознавание чека.
// Ключ Anthropic живёт только тут (.env), в браузер/Mini App не попадает (раздел 7.2).
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import type Anthropic from '@anthropic-ai/sdk';
import { recognizeReceipt } from '../src/lib/receipt/index.js';
import { makeSandboxClient } from '../scripts/sandbox-client.js';

// Node 22 умеет читать .env сам. В dev запускаемся из корня папки, где лежит .env.
try {
  process.loadEnvFile();
} catch {
  // .env не обязателен (ключ может прийти из окружения) — молча едем дальше.
}

const PORT = Number(process.env.PORT ?? 8787);

// DEV-ONLY: когда сервер крутится внутри песочницы Claude, сеть наружу идёт только
// через прокси, а SDK его сам не подхватывает. По флагу SANDBOX_PROXY подкладываем
// клиент с прокси-агентом. В проде/на Маке флага нет → обычный клиент внутри модуля.
let sandboxClient: Anthropic | undefined;
if (process.env.SANDBOX_PROXY) {
  sandboxClient = await makeSandboxClient();
}

const app = Fastify({ logger: true });

// В dev фронт (Vite) живёт на другом порту — разрешаем ему ходить к API.
await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: 15 * 1024 * 1024, files: 10 }, // до 10 фото, по 15 МБ (длинный чек = несколько фото)
});

app.get('/api/health', async () => ({ ok: true }));

// POST /api/recognize — принимает одно или несколько фото одного чека (multipart),
// плюс необязательное текстовое поле currencyHint. Возвращает RecognizedReceipt.
app.post('/api/recognize', async (req, reply) => {
  const images: Buffer[] = [];
  let currencyHint: string | null = null;

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      images.push(await part.toBuffer());
    } else if (part.fieldname === 'currencyHint' && typeof part.value === 'string') {
      currencyHint = part.value;
    }
  }

  if (images.length === 0) {
    return reply.code(400).send({ error: 'Не пришло ни одного фото' });
  }

  // DEV: демо-режим без вызова API (MOCK_RECOGNIZE=1) — чтобы крутить экран, пока нет ключа.
  if (process.env.MOCK_RECOGNIZE) {
    const { sampleReceipt } = await import('../web/src/sampleReceipt.js');
    await new Promise((r) => setTimeout(r, 700)); // имитируем задержку сети
    return sampleReceipt;
  }

  try {
    const result = await recognizeReceipt({ images, currencyHint, client: sandboxClient });
    return result;
  } catch (err) {
    req.log.error(err);
    const message = err instanceof Error ? err.message : 'Не удалось распознать чек';
    return reply.code(502).send({ error: message });
  }
});

app
  .listen({ port: PORT, host: '127.0.0.1' })
  .then(() => app.log.info(`API на http://127.0.0.1:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
