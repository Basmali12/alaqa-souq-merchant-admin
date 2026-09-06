import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

const fn = (name: string) => name as any;
const pushyAppId = import.meta.env.VITE_PUSHY_APP_ID || "6a2b4357a8bcff6c5eaec578";
type MerchantSession = { sessionToken: string; storeId: string; merchantId: string; expiresAt: number };
type CourierSession = { sessionToken: string; courierId: string; storeId: string; courierName: string; expiresAt: number };
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const merchantArgs = (session: MerchantSession) => ({ sessionToken: session.sessionToken, storeId: session.storeId });
const courierArgs = (session: CourierSession) => ({ sessionToken: session.sessionToken });
const phoneForWhatsApp = (value: string) => value.replace(/\D/g, "").replace(/^0/, "964");

function courierUrl(courierId: string, storeId: string) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("role", "courier");
  url.searchParams.set("store", storeId);
  url.searchParams.set("courier", courierId);
  return url.toString();
}

function CourierForm({ session, value, onClose, onCreated }: { session: MerchantSession; value?: any; onClose: () => void; onCreated: (courier: any, link: string) => void }) {
  const create = useAction(fn("courierAuth:create"));
  const update = useMutation(fn("courier:updateForMerchant"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const common = { ...merchantArgs(session), name: String(data.get("name")), whatsapp: String(data.get("whatsapp")), address: String(data.get("address") || "") || undefined };
      if (value) {
        await update({ ...common, courierId: value.courierId });
        onClose();
      } else {
        const result = await create({ ...common, password: String(data.get("password")) }) as any;
        onCreated({ ...common, ...result }, courierUrl(result.courierId, session.storeId));
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message.includes("COURIER_PHONE_EXISTS") ? "رقم الهاتف مستخدم لمندوب آخر." : message.includes("PASSWORD_TOO_SHORT") ? "كلمة السر يجب أن تكون 8 أحرف أو أرقام على الأقل." : message.includes("INVALID_COURIER_PHONE") ? "رقم واتساب غير صحيح." : "تعذر حفظ المندوب.");
    } finally { setBusy(false); }
  }
  return <div className="modal"><form className="panel form courier-form" onSubmit={submit}><header><h2>{value ? "تعديل المندوب" : "إضافة مندوب جديد"}</h2><button type="button" className="ghost" onClick={onClose}>×</button></header>
    <label>اسم المندوب<input name="name" required minLength={2} maxLength={80} defaultValue={value?.name}/></label>
    <label>رقم واتساب<input name="whatsapp" type="tel" inputMode="tel" required placeholder="07xxxxxxxxx" defaultValue={value?.whatsapp}/></label>
    <label className="wide">العنوان (اختياري)<input name="address" maxLength={200} defaultValue={value?.address}/></label>
    {!value && <label className="wide">كلمة سر دخول المندوب<input name="password" type="password" minLength={8} required autoComplete="new-password"/><small>أي أرقام أو أحرف أو رموز، 8 خانات على الأقل.</small></label>}
    {error && <div className="error">{error}</div>}<footer><button className="primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button><button type="button" className="ghost" onClick={onClose}>إلغاء</button></footer>
  </form></div>;
}

export function Couriers({ session }: { session: MerchantSession }) {
  const rows = useQuery(fn("courier:listForMerchant"), merchantArgs(session)) as any[] | undefined;
  const freeze = useMutation(fn("courier:setFrozenForMerchant"));
  const remove = useMutation(fn("courier:deleteForMerchant"));
  const [editing, setEditing] = useState<any>(null);
  const [invite, setInvite] = useState<{ name: string; whatsapp: string; link: string } | null>(null);
  const [error, setError] = useState("");
  async function deleteCourier(row: any) {
    if (!confirm(`حذف المندوب ${row.name} نهائيًا؟`)) return;
    setError("");
    try { await remove({ ...merchantArgs(session), courierId: row.courierId }); } catch { setError("تعذر حذف المندوب."); }
  }
  return <section><div className="toolbar"><div><h2>المندوبون</h2><p className="subtle">أضف المندوبين ثم اختر واحدًا عند إسناد الطلب.</p></div><button className="primary" onClick={() => setEditing("new")}>+ إضافة مندوب جديد</button></div>
    {error && <div className="error">{error}</div>}
    {rows === undefined ? <div className="state">جارٍ تحميل المندوبين…</div> : rows.length === 0 ? <div className="state">لا يوجد مندوبون بعد.</div> : <div className="cards">{rows.map(row => <article className="item courier-card" key={row.courierId}><div className="courier-avatar">{row.name.slice(0, 1)}</div><div className="grow"><h3>{row.name}</h3><p>{row.whatsapp}{row.address ? ` · ${row.address}` : ""}</p><span className={`courier-state ${row.status}`}>{row.status === "active" ? "نشط" : "مجمّد"}</span></div><div className="actions"><button onClick={() => setEditing(row)}>تعديل</button><button onClick={() => freeze({ ...merchantArgs(session), courierId: row.courierId, frozen: row.status === "active" })}>{row.status === "active" ? "تجميد" : "إلغاء التجميد"}</button><button className="danger" onClick={() => deleteCourier(row)}>حذف</button></div></article>)}</div>}
    {editing && (
      <CourierForm
        session={session}
        value={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
        onCreated={(courier, link) => {
          setEditing(null);
          setInvite({ name: courier.name, whatsapp: courier.whatsapp, link });
        }}
      />
    )}
    {invite && <div className="modal"><section className="panel invite-card"><header><h2>رابط المندوب جاهز</h2><button className="ghost" onClick={() => setInvite(null)}>×</button></header><p>أرسل الرابط إلى <b>{invite.name}</b>. الرابط لا يسجّل الدخول تلقائيًا؛ المندوب يثبت التطبيق ثم يدخل برقمه وكلمة السر التي عيّنتها.</p><input readOnly value={invite.link}/><div className="actions"><a className="primary link-button" target="_blank" rel="noreferrer" href={`https://wa.me/${phoneForWhatsApp(invite.whatsapp)}?text=${encodeURIComponent(`ثبّت تطبيق مندوب علاكة سوك وسجّل الدخول من هذا الرابط:\n${invite.link}`)}`}>إرسال عبر واتساب</a><button onClick={() => navigator.clipboard.writeText(invite.link)}>نسخ الرابط</button></div></section></div>}
  </section>;
}

export function CourierAssignment({ session, order }: { session: MerchantSession; order: any }) {
  const rows = useQuery(fn("courier:listForMerchant"), merchantArgs(session)) as any[] | undefined;
  const assign = useMutation(fn("courier:assignOrder"));
  const active = rows?.filter(row => row.status === "active") ?? [];
  const [selected, setSelected] = useState(order.assignedCourierId || "");
  const [state, setState] = useState("");
  useEffect(() => setSelected(order.assignedCourierId || ""), [order.assignedCourierId]);
  if (!["new", "accepted", "preparing", "ready"].includes(order.status)) return order.assignedCourierName ? <p><b>المندوب:</b> {order.assignedCourierName}</p> : null;
  async function submit() {
    if (!selected) return;
    setState("جارٍ الإسناد…");
    try { await assign({ ...merchantArgs(session), orderId: order.orderId, courierId: selected }); setState("تم إسناد الطلب وإرسال التنبيه."); } catch { setState("تعذر إسناد الطلب."); }
  }
  return <div className="assign-courier"><label>إسناد إلى مندوب<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">اختر مندوبًا</option>{active.map(row => <option value={row.courierId} key={row.courierId}>{row.name}</option>)}</select></label><button disabled={!selected} onClick={submit}>إسناد الطلب</button>{order.assignedCourierName && <small>المسند حاليًا: {order.assignedCourierName}</small>}{!active.length && <small>أضف مندوبًا نشطًا أولًا.</small>}{state && <small>{state}</small>}</div>;
}

function courierDeviceId() {
  const key = "alaqa_courier_device_id"; let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function PwaInstallGate({ onStandalone }: { onStandalone: () => void }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [manualHelp, setManualHelp] = useState(false);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    const installReady = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const refresh = () => { if (isStandalone()) onStandalone(); };
    window.addEventListener("beforeinstallprompt", installReady);
    window.addEventListener("appinstalled", refresh);
    document.addEventListener("visibilitychange", refresh);
    if ("serviceWorker" in navigator) {
      const basePath = new URL(import.meta.env.BASE_URL, location.href).pathname;
      navigator.serviceWorker.register(`${basePath}service-worker.js`, { scope: basePath }).catch(() => setManualHelp(true));
    }
    return () => { window.removeEventListener("beforeinstallprompt", installReady); window.removeEventListener("appinstalled", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [onStandalone]);
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    setInstalled(choice.outcome === "accepted");
  }
  return <main className="login install-page"><section className="panel login-card install-card"><img className="courier-brand-image" src="./icons/courier-512.png" alt="مندوب علاكة سوك"/><p className="eyebrow">مندوب علاكة سوك</p><h1>ثبّت التطبيق للمتابعة</h1><p>حفاظًا على وصول تنبيهات الطلبات، تسجيل الدخول متاح من التطبيق المثبّت فقط.</p>
    {ios ? <div className="install-instructions"><h2>التثبيت على iPhone</h2><ol><li>افتح الرابط في Safari.</li><li>اضغط زر المشاركة <b>□↑</b>.</li><li>اختر «إضافة إلى الشاشة الرئيسية».</li><li>افتح «مندوب علاكة سوك» من الأيقونة الجديدة.</li></ol></div> : <><button className="primary install-button" onClick={() => prompt ? install() : setManualHelp(true)}>تثبيت تطبيق مندوب علاكة سوك</button>{(!prompt || manualHelp) && <div className="install-instructions"><h2>إذا لم تظهر نافذة التثبيت</h2><p>افتح قائمة المتصفح <b>⋮</b> ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p></div>}</>}
    {installed && <div className="success">تم التثبيت. افتح التطبيق من الأيقونة على الشاشة الرئيسية.</div>}
    <p className="install-lock">🔒 يجب فتح النسخة المثبّتة حتى تظهر شاشة الدخول.</p>
  </section></main>;
}

function CourierLogin({ onDone }: { onDone: (session: CourierSession) => void }) {
  const signIn = useAction(fn("courierAuth:signIn")); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { const session = await signIn({ phone: String(data.get("phone")), password: String(data.get("password")) }) as CourierSession; localStorage.setItem("alaqa_courier_session", JSON.stringify(session)); onDone(session); } catch (cause) { const value = cause instanceof Error ? cause.message : String(cause); setError(value.includes("FROZEN") ? "حساب المندوب مجمّد من التاجر." : value.includes("NOT_FOUND") ? "حساب المندوب غير موجود." : "رقم الهاتف أو كلمة السر غير صحيحة."); } finally { setBusy(false); } }
  return <main className="login courier-login"><form className="panel login-card" onSubmit={submit}><img className="courier-brand-image" src="./icons/courier-512.png" alt="مندوب علاكة سوك"/><p className="eyebrow">مندوب علاكة سوك</p><h1>تسجيل دخول المندوب</h1><label>رقم الهاتف<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="07xxxxxxxxx"/></label><label>كلمة السر<input name="password" type="password" autoComplete="current-password" required/></label>{error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "جارٍ الدخول…" : "دخول المندوب"}</button></form></main>;
}

function NotificationGate({ session, onDone }: { session: CourierSession; onDone: () => void }) {
  const register = useMutation(fn("courier:registerPushDevice")); const [state, setState] = useState("");
  async function enable() { setState("جارٍ طلب إذن الإشعارات…"); try { if (!window.Pushy) throw new Error("تعذر تحميل خدمة الإشعارات"); const basePath = new URL(import.meta.env.BASE_URL, location.href).pathname; const deviceToken = await window.Pushy.register({ appId: pushyAppId, serviceWorkerFile: `${basePath}service-worker.js`, serviceWorkerScope: basePath }); await register({ ...courierArgs(session), deviceId: courierDeviceId(), deviceToken }); localStorage.setItem(`alaqa_courier_push_${session.courierId}`, "enabled"); onDone(); } catch (cause) { setState(cause instanceof Error ? cause.message : "يجب السماح بالإشعارات للمتابعة."); } }
  return <main className="login"><section className="panel login-card notification-gate"><img className="courier-brand-image" src="./icons/courier-512.png" alt="مندوب علاكة سوك"/><h1>تفعيل الإشعارات مطلوب</h1><p>حتى يصلك تنبيه «لديك طلب» فور اختيارك من التاجر، وافق على إذن الإشعارات في هذا الجهاز.</p><button className="primary" onClick={enable}>تفعيل الإشعارات والمتابعة</button>{state && <div className="warning">{state}</div>}</section></main>;
}

function CourierDashboard({ session, onLogout }: { session: CourierSession; onLogout: () => void }) {
  const access = useQuery(fn("courier:accessStatus"), courierArgs(session)) as any;
  const orders = useQuery(fn("courier:listMyOrders"), access?.status === "active" ? courierArgs(session) : "skip") as any[] | undefined;
  if (!access) return <div className="state">جارٍ التحقق من الحساب…</div>;
  if (access.status !== "active") return <main className="login"><section className="panel login-card"><h1>تعذر فتح حساب المندوب</h1><div className="error">{access.status === "frozen" ? "الحساب مجمّد من التاجر." : "انتهت الجلسة أو حُذف الحساب."}</div><button className="primary" onClick={onLogout}>العودة لتسجيل الدخول</button></section></main>;
  return <div className="courier-app"><header><div><p className="eyebrow">مندوب علاكة سوك</p><h1>أهلًا {access.name}</h1></div><button className="ghost" onClick={onLogout}>تسجيل الخروج</button></header><main><h2>طلبات التوصيل</h2>{orders === undefined ? <div className="state">جارٍ تحميل الطلبات…</div> : orders.length === 0 ? <div className="state">لا توجد طلبات مسندة إليك حاليًا.</div> : <div className="cards">{orders.map(order => <article className="panel courier-order" id={`courier-order-${order.orderId}`} key={order.orderId}><div><b>طلب #{order.orderId.slice(0, 8)}</b><span>{order.customerName || "زبون"}</span></div><strong>{(order.total || 0).toLocaleString("ar-IQ")} د.ع</strong><p>{[order.province, order.landmark, order.address].filter(Boolean).join(" · ")}</p><p>هاتف الزبون: {order.phone || "غير مسجل"}</p></article>)}</div>}</main></div>;
}

export function CourierApp() {
  const initial = useMemo(() => { try { const value = JSON.parse(localStorage.getItem("alaqa_courier_session") || "null"); return value?.expiresAt > Date.now() ? value as CourierSession : null; } catch { return null; } }, []);
  const [session, setSession] = useState<CourierSession | null>(initial); const [pushReady, setPushReady] = useState(() => !!initial && localStorage.getItem(`alaqa_courier_push_${initial.courierId}`) === "enabled"); const [standalone, setStandalone] = useState(isStandalone); const signOut = useAction(fn("courierAuth:signOut")); const unregister = useMutation(fn("courier:unregisterPushDevice"));
  async function logout() { if (session) { try { await unregister({ ...courierArgs(session), deviceId: courierDeviceId() }); } catch {} try { await signOut({ sessionToken: session.sessionToken }); } catch {} localStorage.removeItem(`alaqa_courier_push_${session.courierId}`); } localStorage.removeItem("alaqa_courier_session"); setSession(null); setPushReady(false); }
  if (!standalone) return <PwaInstallGate onStandalone={() => setStandalone(true)}/>;
  if (!session) return <CourierLogin onDone={value => { setSession(value); setPushReady(localStorage.getItem(`alaqa_courier_push_${value.courierId}`) === "enabled"); }}/>;
  if (!pushReady) return <NotificationGate session={session} onDone={() => setPushReady(true)}/>;
  return <CourierDashboard session={session} onLogout={logout}/>;
}
