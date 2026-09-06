import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { LocalSound, type SoundConfig } from "./local-sound";
type SoundProps = { sessionToken: string; actor: string; storeId?: string };
class SoundBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.info("notification-sound", { status: "settings-failure" }); }
  render() { return this.state.failed ? <small>الصوت المخصص غير متاح حاليًا؛ إشعارات الطلبات مستمرة.</small> : this.props.children; }
}
export function NotificationSound(props: SoundProps) { return <SoundBoundary key={props.actor}><SoundControl {...props}/></SoundBoundary>; }
function SoundControl({ sessionToken, actor, storeId }: SoundProps) {
  const type = "merchant_order_sound";
  const config = useQuery("notificationSounds:read" as any, { type, sessionToken }) as SoundConfig | null | undefined;
  const orders = useQuery("merchant:listOrders" as any, { sessionToken, storeId }) as any[] | undefined;
  const [, render] = useState(0);
  const [error, setError] = useState("");
  const engine = useMemo(() => new LocalSound(type, actor, () => render(x => x + 1)), [actor]);
  const observed = useRef<Set<string> | null>(null);
  useEffect(() => { engine.activate(); return () => engine.dispose(); }, [engine]);
  useEffect(() => { if (config !== undefined) void engine.sync(config); }, [config, engine]);
  useEffect(() => {
    if (!orders) return;
    const ids = orders.map(order => String(order.orderId));
    if (observed.current) for (const id of ids) if (!observed.current.has(id)) void engine.play(id);
    observed.current = new Set(ids);
  }, [orders, engine]);
  async function enable() { try { await engine.unlock(); setError(""); } catch { setError("اضغط مجددًا لتفعيل الصوت؛ قد يمنعه المتصفح."); } }
  return <section className="panel" style={{ padding: 12, marginBottom: 12 }} aria-label="صوت الإشعارات">
    <button type="button" onClick={enable} disabled={config?.enabled === false}>{engine.ready ? "صوت الإشعارات مفعّل" : "تفعيل صوت الإشعارات"}</button>
    <small style={{ display: "block", marginTop: 6 }}>{config === null ? "لم تضف الإدارة صوتًا بعد." : config?.enabled === false ? "الصوت المخصص معطّل من الإدارة." : "الصوت المخصص أثناء فتح الصفحة؛ خارج التطبيق يصلك تنبيه النظام."}</small>
    {error && <p role="status">{error}</p>}
  </section>;
}
