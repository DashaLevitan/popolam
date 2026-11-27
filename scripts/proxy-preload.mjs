// DEV-ONLY, только для прогона внутри песочницы Claude (VM с обязательным прокси).
// В проде/на Маке Даши не используется — сервер запускается без этого преднагрузчика.
// Делает так, чтобы встроенный fetch (undici) ходил наружу через HTTPS_PROXY,
// иначе SDK Anthropic не достучится до api.anthropic.com. localhost (NO_PROXY) идёт напрямую.
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
  console.error('[proxy-preload] EnvHttpProxyAgent включён (dev sandbox)');
}
