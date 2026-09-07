import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { PushRegistration, type PushState } from './push-registration';
type Session = { sessionToken: string; storeId: string; merchantId: string };
type Push = { state: PushState; saved: boolean; enable: () => Promise<void>; stop: () => Promise<void> };
export const MerchantPushContext = createContext<Push>({state:'idle',saved:false,enable:async()=>{},stop:async()=>{}});
export const useMerchantPushState = () => useContext(MerchantPushContext);
export function useMerchantPush(session: Session | null, deviceId: () => string, appId: string): Push {
  const register = useMutation('merchant:registerPushDevice' as any);
  const [, render] = useState(0);
  const manager = useMemo(() => session ? new PushRegistration({
    key: `alaqa_merchant_push_${session.merchantId}`,
    storage: localStorage,
    permission: () => 'Notification' in window ? Notification.permission : 'unsupported',
    request: () => Notification.requestPermission(),
    changed: () => render(value => value + 1),
    register: async current => {
      // A deferred SDK script can finish after React; wait, do not falsely ask for permission again.
      for (let i=0; !window.Pushy && i<100 && current(); i++) await new Promise(resolve => setTimeout(resolve,100));
      if (!current()) return;
      if (!window.Pushy || !navigator.onLine) throw new Error('PUSH_UNAVAILABLE');
      const basePath = new URL(import.meta.env.BASE_URL, location.href).pathname;
      const deviceToken = await window.Pushy.register({ appId, serviceWorkerFile: `${basePath.replace(/^\/+/, '')}service-worker.js`, serviceWorkerScope: basePath });
      if (current()) await register({sessionToken:session.sessionToken,storeId:session.storeId,deviceId:deviceId(),deviceToken});
    },
  }) : null, [session?.sessionToken, session?.storeId, session?.merchantId, register, deviceId, appId]);
  useEffect(() => {
    if (!manager) return;
    manager.activate();
    const restore = () => { if (!document.hidden) void manager.ensure(); };
    restore();
    window.addEventListener('online',restore);
    document.addEventListener('visibilitychange',restore);
    return () => { void manager.stop(); window.removeEventListener('online',restore); document.removeEventListener('visibilitychange',restore); };
  },[manager]);
  return {state:manager?.state || 'idle', saved:manager?.saved || false, enable:async()=>{await manager?.ensure(true);}, stop:async()=>{await manager?.stop();}};
}
