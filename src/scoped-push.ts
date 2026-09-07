import Pushy from './vendor/pushy/lib/pushy.js';
import config from './vendor/pushy/config.js';
import {isolatePushyStorage} from './push-namespace';

const basePath = new URL(import.meta.env.BASE_URL, location.href).pathname;
const namespace = isolatePushyStorage(config, 'merchant', basePath);

export async function registerScopedPush(appId: string, current: () => boolean): Promise<string | undefined> {
  const register = async () => {
    if (!current()) return undefined;
    if (!navigator.onLine) throw new Error('PUSH_UNAVAILABLE');
    const token = await Pushy.register({
      appId,
      serviceWorkerFile: `${basePath.replace(/^\/+/, '')}service-worker.js`,
      serviceWorkerScope: basePath,
    });
    if (typeof token !== 'string' || token.trim().length < 12 || token.length > 2048) throw new Error('PUSH_REGISTRATION_FAILED');
    return token;
  };
  // Same-app tabs serialize registration; the other app uses a different lock/cache.
  return navigator.locks ? navigator.locks.request(namespace, register) : register();
}
