// DEV-ONLY. Клиент Anthropic, ходящий наружу через прокси песочницы Claude.
// Нужен только когда сервер крутится внутри VM Claude (там сеть только через прокси,
// а SDK его сам не подхватывает). В проде/на Маке Даши НЕ вызывается — только при
// заданном флаге SANDBOX_PROXY. Прокси даём SDK через кастомный fetch на undici.
import Anthropic from '@anthropic-ai/sdk';

export async function makeSandboxClient(): Promise<Anthropic> {
  const { ProxyAgent, fetch: undiciFetch } = await import('undici');
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  const sdkFetch = ((url: any, init: any) =>
    undiciFetch(url, { ...init, dispatcher })) as unknown as typeof fetch;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: sdkFetch });
}
