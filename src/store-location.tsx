import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";

export function StoreLocation({ sessionToken, storeId, confirmed }: { sessionToken: string; storeId: string; confirmed: boolean }) {
  const save = useMutation("merchant:setStoreLocation" as any);
  const [atShop, setAtShop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function locate() {
    if (!atShop || pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      if (!navigator.geolocation) throw new Error("المتصفح لا يدعم تحديد الموقع.");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve,
        error => reject(new Error(error.code === 1 ? "اسمح بإذن الموقع من إعدادات المتصفح ثم أعد المحاولة." : "تعذر تحديد الموقع. شغّل GPS وحاول قرب باب المحل.")),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
      if (!active.current) return;
      if (position.coords.accuracy > 100) throw new Error("الموقع غير دقيق. حاول قرب باب المحل ثم أعد التحديد.");
      await save({ sessionToken, storeId, latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy: position.coords.accuracy, capturedAt: position.timestamp, confirmedAtShop: true });
      if (active.current) setMessage("تم حفظ موقع المحل. لن يتغير عند تحرك هاتفك.");
    } catch (error) {
      if (active.current) setMessage(error instanceof Error && !error.message.includes("Convex") ? error.message : "تعذر حفظ الموقع. تحقق من الاتصال وأعد المحاولة.");
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <section className="panel settings-card"><h2>📍 موقع المحل</h2>
    <p>{confirmed ? "موقع المحل محفوظ. حدّثه فقط إذا تغير مكان المحل." : "يجب تثبيت موقع محلك قبل متابعة إدارة المتجر."}</p>
    <p>قف داخل المحل أو عند بابه، ثم فعّل GPS. لا نتابع موقعك بعد الحفظ.</p>
    <label><input type="checkbox" checked={atShop} disabled={busy} onChange={e => setAtShop(e.target.checked)}/> أؤكد أنني موجود داخل المحل الآن</label>
    <button className="primary" disabled={!atShop || busy} onClick={() => void locate()}>{busy ? "جارٍ تحديد الموقع وحفظه…" : "تحديد موقعي وأنا داخل المحل"}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
