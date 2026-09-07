import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { PushRegistration, type PushState } from './push-registration';
import { registerScopedPush } from './scoped-push';
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
      const deviceToken = await registerScopedPush(appId, current);
      if (!deviceToken) return;
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
