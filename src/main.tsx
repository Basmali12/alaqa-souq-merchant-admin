import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient, useAction, useMutation, useQuery } from "convex/react";
import "./styles.css";
import "./pwa.css";
import "./password-settings.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || "https://neighborly-badger-796.convex.cloud");
const pushyAppId = import.meta.env.VITE_PUSHY_APP_ID || "6a2b4357a8bcff6c5eaec578";
const fn = (name: string) => name as any;
const urlParams = new URLSearchParams(location.search);
const storeFromUrl = urlParams.get("store") || "";
const orderFromUrl = urlParams.get("order") || "";
type Session = { sessionToken: string; storeId: string; merchantId: string; expiresAt: number };
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const sessionArgs = (session: Session) => ({ sessionToken: session.sessionToken, storeId: session.storeId });
const whatsappLink = (phone: string | undefined) => {
  let value = String(phone || "").replace(/[^0-9+]/g, "");
  if (value.startsWith("00964")) value = value.slice(2);
  else if (value.startsWith("+")) value = value.slice(1);
  else if (value.startsWith("0")) value = `964${value.slice(1)}`;
  return value ? `https://wa.me/${value}` : "";
};
const deletedAccountMessage = "تم حذف حسابك نهائيًا لأنك لم تستوفِ شروط النظام. لا يمكن إعادة الحساب حتى بعد مراجعة الشركة.";
function merchantErrorMessage(error: unknown) {
  const value = error instanceof Error ? error.message : String(error ?? "");
  if (value.includes("MERCHANT_ACCOUNT_DELETED")) return deletedAccountMessage;
  if (value.includes("MERCHANT_ACCOUNT_NOT_CREATED")) return "الحساب لم يُنشأ بعد.";
  if (value.includes("MERCHANT_ACCOUNT_SUSPENDED")) return "الحساب موقوف من الإدارة.";
  if (value.includes("INVALID_MERCHANT_PHONE")) return "رقم الهاتف غير صحيح.";
  if (value.includes("INVALID_MERCHANT_CREDENTIALS")) return "رقم الهاتف أو كلمة المرور غير صحيحة.";
  return "تعذر تسجيل الدخول";
}

function deviceId() {
  const key = "alaqa_merchant_device_id";
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}

function Login({ onDone, notice }: { onDone: (value: Session) => void; notice?: string }) {
  const signIn = useAction(fn("merchantAuth:signIn"));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      const result = await signIn({ phone: String(data.get("phone")), password: String(data.get("password")) }) as Session;
      if (storeFromUrl && result.storeId !== storeFromUrl) throw new Error("هذا الحساب لا يملك المتجر المطلوب");
      localStorage.setItem("alaqa_merchant_session", JSON.stringify(result)); onDone(result);
    } catch (error) { setError(merchantErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <main className="login"><form className="panel login-card" onSubmit={submit}>
    <img className="login-logo" src="./icons/icon-192.png" alt="علاكة سوق"/><p className="eyebrow">علاكة سوق</p><h1>دخول التاجر</h1>
    <p>الرابط يساعد على تحديد المتجر فقط؛ ملكية الحساب تُفحص من الخادم.</p>
    {notice && <div className="success">{notice}</div>}
    <label>رقم الهاتف<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="07xxxxxxxxx"/></label>
    <label>كلمة المرور<input name="password" type="password" autoComplete="current-password" required/></label>
    {error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "جارٍ التحقق…" : "دخول آمن"}</button>
  </form></main>;
}

async function uploadImage(file: File | null, generate: () => Promise<string>) {
  if (!file || file.size === 0) return undefined;
  if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) throw new Error("اختر صورة صحيحة بحجم أقل من 12MB");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d", { alpha: false })!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const body = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("تعذر تجهيز الصورة")), "image/webp", .86));
  const response = await fetch(await generate(), { method: "POST", headers: { "Content-Type": "image/webp" }, body });
  if (!response.ok) throw new Error("فشل رفع الصورة"); return (await response.json()).storageId as string;
}

function ProductForm({ session, value, onClose }: { session: Session; value?: any; onClose: () => void }) {
  const save = useMutation(fn("merchant:saveProduct")); const generate = useMutation(fn("merchant:generateUploadUrl"));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const imageStorageId = await uploadImage(form.get("image") as File, () => generate(sessionArgs(session)));
      await save({ ...sessionArgs(session), productId: value?.productId, name: String(form.get("name")), canonicalProductKey: String(form.get("canonicalProductKey")).trim().toLowerCase(), category: String(form.get("category")), unit: String(form.get("unit")), currentPrice: Number(form.get("currentPrice")), ...(imageStorageId ? { imageStorageId } : {}) }); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر حفظ المنتج"); } finally { setBusy(false); }
  }
  return <div className="modal"><form className="panel form" onSubmit={submit}><header><h2>{value ? "تعديل المنتج" : "إضافة منتج"}</h2><button type="button" className="ghost" onClick={onClose}>×</button></header>
    <label>اسم المنتج<input name="name" required defaultValue={value?.name}/></label><label>المفتاح الموحد<input name="canonicalProductKey" pattern="[a-z0-9._-]{2,80}" required defaultValue={value?.canonicalProductKey} placeholder="tomato"/></label>
    <label>التصنيف<input name="category" required defaultValue={value?.category}/></label><label>الوحدة<input name="unit" required defaultValue={value?.unit} placeholder="كغم / حبة / صندوق"/></label>
    <label>السعر الحالي<input name="currentPrice" type="number" min="0" step="1" required defaultValue={value?.currentPrice}/></label>{value && <label>السعر السابق<input readOnly value={value.previousPrice ?? "لا يوجد"}/></label>}<label>الصورة<input name="image" type="file" accept="image/*"/></label>
    {error && <div className="error">{error}</div>}<footer><button className="primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button><button type="button" className="ghost" onClick={onClose}>إلغاء</button></footer></form></div>;
}

function Products({ session }: { session: Session }) {
  const products = useQuery(fn("merchant:listProducts"), sessionArgs(session)) as any[] | undefined; const remove = useMutation(fn("merchant:deleteProduct")); const setAvailability = useMutation(fn("merchant:setProductAvailability")); const [edit, setEdit] = useState<any>(null);
  return <section><div className="toolbar"><h2>المنتجات</h2><button className="primary" onClick={() => setEdit("new")}>+ إضافة منتج</button></div>
    {products === undefined ? <State text="جارٍ تحميل المنتجات…"/> : products.length === 0 ? <State text="لا توجد منتجات بعد"/> : <div className="cards">{products.map(product => <article className="item" key={product.productId}>
      {product.imageUrl ? <img src={product.imageUrl} alt=""/> : <div className="placeholder">صورة</div>}<div className="grow"><h3>{product.name}</h3><p>{product.category} · {product.unit} · {product.status === "active" ? "متوفر" : "غير متوفر"}</p><strong>{product.currentPrice.toLocaleString("ar-IQ")} د.ع</strong>{product.previousPrice != null && <small>السابق: {product.previousPrice.toLocaleString("ar-IQ")}</small>}</div>
      <div className="actions"><button onClick={() => setEdit(product)}>تعديل</button><button onClick={() => setAvailability({ ...sessionArgs(session), productId: product.productId, isAvailable: product.status !== "active" })}>{product.status === "active" ? "جعله غير متوفر" : "جعله متوفرًا"}</button><button className="danger" onClick={() => remove({ ...sessionArgs(session), productId: product.productId })}>حذف</button></div></article>)}</div>}
    {edit && <ProductForm session={session} value={edit === "new" ? undefined : edit} onClose={() => setEdit(null)}/>}</section>;
}

function Offers({ session }: { session: Session }) {
  const products = useQuery(fn("merchant:listProducts"), sessionArgs(session)) as any[] | undefined; const rows = useQuery(fn("merchant:listOffers"), sessionArgs(session)) as any[] | undefined; const save = useMutation(fn("merchant:saveOffer"));
  const [open, setOpen] = useState(false); const [productId, setProductId] = useState(""); const [offerPrice, setOfferPrice] = useState(0); const product = products?.find(value => value.productId === productId);
  const discount = product && offerPrice > 0 ? Math.max(0, Math.round((product.currentPrice - offerPrice) * 100 / product.currentPrice)) : 0;
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await save({ ...sessionArgs(session), productId, offerPrice, startsAt: new Date(String(form.get("startsAt"))).getTime(), endsAt: new Date(String(form.get("endsAt"))).getTime(), isActive: true }); setOpen(false); }
  return <section><div className="toolbar"><h2>عروض اليوم</h2><button className="primary" disabled={!products?.length} onClick={() => setOpen(true)}>+ إضافة عرض</button></div>
    {!rows ? <State text="جارٍ التحميل…"/> : rows.length === 0 ? <State text="لا توجد عروض"/> : <div className="cards">{rows.map(row => <article className="item" key={row.offerId}><div className="grow"><h3>{row.productName || row.title}</h3><p><s>{row.oldPrice}</s> ← {row.newPrice} د.ع</p><strong>{row.discountText}</strong></div></article>)}</div>}
    {open && <div className="modal"><form className="panel form" onSubmit={submit}><header><h2>إضافة عرض</h2><button type="button" className="ghost" onClick={() => setOpen(false)}>×</button></header><label>المنتج<select required value={productId} onChange={event => { setProductId(event.target.value); setOfferPrice(0); }}><option value="">اختر منتجًا</option>{products?.map(row => <option key={row.productId} value={row.productId}>{row.name}</option>)}</select></label><label>السعر السابق<input readOnly value={product?.currentPrice ?? ""}/></label><label>سعر العرض<input type="number" min="0" max={product?.currentPrice ? product.currentPrice - 1 : 0} required value={offerPrice || ""} onChange={event => setOfferPrice(Number(event.target.value))}/></label><p className="discount">نسبة الخصم: {discount}%</p><label>البداية<input name="startsAt" type="datetime-local" required/></label><label>النهاية<input name="endsAt" type="datetime-local" required/></label><footer><button className="primary">حفظ العرض</button><button type="button" className="ghost" onClick={() => setOpen(false)}>إلغاء</button></footer></form></div>}
  </section>;
}

function Orders({ session }: { session: Session }) {
  const rows = useQuery(fn("merchant:listOrders"), sessionArgs(session)) as any[] | undefined;
  const setStatus = useMutation(fn("merchant:setOrderStatus"));
  const [group, setGroup] = useState("new");
  const [expanded, setExpanded] = useState(orderFromUrl);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const groups = [["new", "الطلبات الجديدة"], ["preparing", "قيد التحضير"], ["ready", "الجاهزة"], ["out_for_delivery", "الخارجة للتوصيل"], ["delivered", "المكتملة"], ["cancelled", "الملغاة"]];
  const normalizedGroup = (status: string) => status === "accepted" ? "preparing" : status === "completed" ? "delivered" : status;
  const statusLabel = (status: string) => ({ new: "جديد", accepted: "مقبول", preparing: "قيد التحضير", ready: "جاهز", out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم", completed: "مكتمل", cancelled: "ملغي" } as Record<string,string>)[status] || status;
  const next = (status: string) => ({ accepted: ["preparing", "بدء التحضير"], preparing: ["ready", "جاهز"], ready: ["out_for_delivery", "خرج للتوصيل"], out_for_delivery: ["delivered", "تم التسليم"] } as Record<string,[string,string]>)[status];
  async function change(orderId: string, status: string) { setBusy(orderId); setError(""); try { await setStatus({ ...sessionArgs(session), orderId, status }); } catch (value) { setError(value instanceof Error ? value.message : "تعذر تحديث الطلب"); } finally { setBusy(""); } }
  if (!rows) return <State text="جارٍ تحميل الطلبات…"/>;
  if (!rows.length) return <State text="لا توجد طلبات حتى الآن"/>;
  const visible = rows.filter(order => normalizedGroup(order.status) === group);
  return <section><div className="toolbar"><h2>الطلبات</h2></div><div className="order-tabs">{groups.map(([id,label]) => <button className={group === id ? "active" : ""} key={id} onClick={() => setGroup(id)}>{label}<b>{rows.filter(order => normalizedGroup(order.status) === id).length}</b></button>)}</div>{error && <div className="error">{error}</div>}
    {visible.length === 0 ? <State text="لا توجد طلبات في هذه الحالة"/> : <div className="cards">{visible.map(order => { const action = next(order.status); const open = expanded === order.orderId; return <article id={`order-${order.orderId}`} className={`item order-card ${order.orderId === orderFromUrl ? "highlight" : ""}`} key={order.orderId}>
      <button className="order-summary" onClick={() => setExpanded(open ? "" : order.orderId)}><span><strong>طلب #{order.orderId.slice(0, 8)}</strong><small>{order.customerName || "زبون"} · {new Date(order.createdAt).toLocaleString("ar-IQ")}</small></span><b>{(order.total ?? 0).toLocaleString("ar-IQ")} د.ع</b><em>{statusLabel(order.status)}</em></button>
      {open && <div className="order-detail"><h3>المنتجات</h3>{order.items?.length ? order.items.map((item:any) => <p key={item.productId}>{item.productName} × {item.quantity} — {(item.priceAtOrder * item.quantity).toLocaleString("ar-IQ")} د.ع</p>) : <p>{order.summary || "طلب قديم بلا تفاصيل منتجات"}</p>}<hr/><p><b>اسم الزبون:</b> {order.customerName || "غير مسجل"}</p><p><b>رقم الهاتف:</b> {order.phone || "غير مسجل"}</p><p><b>المحافظة:</b> {order.province || "غير مسجلة"}</p><p><b>أقرب نقطة دالة:</b> {order.landmark || "غير مسجلة"}</p><p><b>العنوان:</b> {order.address || "غير مسجل"}</p>{order.notes && <p><b>الملاحظات:</b> {order.notes}</p>}<p><b>الدفع:</b> الدفع عند الاستلام</p>{whatsappLink(order.phone) && <a className="map-link" href={whatsappLink(order.phone)} target="_blank" rel="noreferrer">مراسلة الزبون عبر واتساب</a>}{order.latitude != null && order.longitude != null && <a className="map-link" href={`geo:${order.latitude},${order.longitude}?q=${order.latitude},${order.longitude}`} target="_blank" rel="noreferrer">فتح موقع الزبون</a>}
        <div className="actions">{order.status === "new" && <><button disabled={busy === order.orderId} onClick={() => change(order.orderId, "accepted")}>قبول</button><button className="danger" disabled={busy === order.orderId} onClick={() => change(order.orderId, "cancelled")}>رفض</button></>}{action && <button disabled={busy === order.orderId} onClick={() => change(order.orderId, action[0])}>{action[1]}</button>}</div></div>}
    </article>; })}</div>}</section>;
}

function PushAndInstall({ session }: { session: Session }) {
  const registerDevice = useMutation(fn("merchant:registerPushDevice")); const [pushState, setPushState] = useState(""); const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => { const listener = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); }; window.addEventListener("beforeinstallprompt", listener); return () => window.removeEventListener("beforeinstallprompt", listener); }, []);
  async function enablePush() {
    setPushState("جارٍ طلب الإذن…");
    try {
      if (!window.Pushy) throw new Error("تعذر تحميل خدمة الإشعارات");
      const basePath = new URL(import.meta.env.BASE_URL, location.href).pathname; const serviceWorkerFile = `${basePath.replace(/^\/+/, "")}service-worker.js`;
      const deviceToken = await window.Pushy.register({ appId: pushyAppId, serviceWorkerFile, serviceWorkerScope: basePath });
      await registerDevice({ ...sessionArgs(session), deviceId: deviceId(), deviceToken }); setPushState("تم تفعيل إشعارات الطلبات لهذا الجهاز");
    } catch (error) { setPushState(error instanceof Error ? error.message : "تعذر تفعيل الإشعارات"); }
  }
  async function install() { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }
  return <section className="panel settings-card"><h2>الجهاز والإشعارات</h2><p>فعّل الإشعارات لاستلام تنبيه مختصر عند وصول طلب جديد لمتجرك فقط.</p><div className="toolbar compact"><button className="primary" onClick={enablePush}>تفعيل إشعارات الطلبات</button>{installPrompt && <button className="ghost" onClick={install}>تثبيت لوحة الإدارة</button>}</div>{!installPrompt && <p className="install-help">يمكن تثبيت اللوحة من خيار «إضافة إلى الشاشة الرئيسية» في المتصفح.</p>}{pushState && <p className="push-state">{pushState}</p>}</section>;
}

function PasswordSettings({ session, onChanged }: { session: Session; onChanged: () => void }) {
  const changePassword = useAction(fn("merchantAuth:changePassword"));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword")); const newPassword = String(form.get("newPassword"));
    if (newPassword !== String(form.get("confirmPassword"))) { setError("تأكيد كلمة المرور غير مطابق."); setBusy(false); return; }
    try {
      await changePassword({ ...sessionArgs(session), currentPassword, newPassword });
      onChanged();
    } catch (cause) {
      const value = cause instanceof Error ? cause.message : String(cause);
      setError(value.includes("INVALID_CURRENT_PASSWORD") ? "كلمة المرور الحالية غير صحيحة." : value.includes("PASSWORD_TOO_SHORT") ? "كلمة المرور الجديدة يجب أن تكون 8 أحرف أو أرقام على الأقل." : "تعذر تغيير كلمة المرور.");
    } finally { setBusy(false); }
  }
  return <section className="panel settings-card"><h2>تغيير كلمة المرور</h2><p>يمكن أن تكون أرقامًا أو أحرفًا أو رموزًا، والمطلوب 8 خانات على الأقل.</p><form className="password-form" onSubmit={submit}><label>كلمة المرور الحالية<input name="currentPassword" type="password" autoComplete="current-password" required/></label><label>كلمة المرور الجديدة<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required/></label><label>تأكيد كلمة المرور<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required/></label>{error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "جارٍ التغيير…" : "تغيير كلمة المرور"}</button></form></section>;
}

function MerchantSettings({ session, onPasswordChanged }: { session: Session; onPasswordChanged: () => void }) {
  return <div className="settings-stack"><PasswordSettings session={session} onChanged={onPasswordChanged}/><PushAndInstall session={session}/></div>;
}

function State({ text }: { text: string }) { return <div className="state">{text}</div>; }

function Dashboard({ session, onLogout, onPasswordChanged }: { session: Session; onLogout: () => void; onPasswordChanged: () => void }) {
  const store = useQuery(fn("merchant:dashboard"), sessionArgs(session)) as any; const setOpen = useMutation(fn("merchant:setOpen")); const [tab, setTab] = useState(orderFromUrl ? "orders" : "home");
  useEffect(() => { if (tab === "orders" && orderFromUrl) setTimeout(() => document.getElementById(`order-${orderFromUrl}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100); }, [tab]);
  if (store === undefined) return <State text="جارٍ التحقق من ملكية المتجر…"/>;
  return <div className="app"><aside><div className="identity">{store.imageUrl ? <img src={store.imageUrl} alt=""/> : <div className="logo">ع</div>}<div><h1>{store.name}</h1><p>{store.ownerName}</p></div><span className={`status ${store.status}`}>{store.status}</span></div><nav>{[["home", "الرئيسية"], ["products", "المنتجات"], ["offers", "عروض اليوم"], ["orders", "الطلبات"], ["settings", "إعدادات المتجر"]].map(([id, label]) => <button key={id} className={tab === id ? "active":""} onClick={() => setTab(id)}>{label}</button>)}</nav><button className="logout" onClick={onLogout}>تسجيل الخروج</button></aside><main><header className="page-head"><div><p className="eyebrow">لوحة التاجر</p><h2>{store.name}</h2></div><label className="switch"><input type="checkbox" checked={store.isOpen} disabled={store.status !== "active"} onChange={event => setOpen({ ...sessionArgs(session), isOpen: event.target.checked })}/><span>{store.isOpen ? "مفتوح" : "مغلق"}</span></label></header>{store.status !== "active" && <div className="warning">الحساب موقوف من الإدارة ولا يمكن للتاجر إعادة تفعيله.</div>}{tab === "products" ? <Products session={session}/> : tab === "offers" ? <Offers session={session}/> : tab === "orders" ? <Orders session={session}/> : tab === "settings" ? <MerchantSettings session={session} onPasswordChanged={onPasswordChanged}/> : <section className="panel summary"><h2>ملخص المتجر</h2><p>{store.province} · {store.area}</p><p>{store.category}</p><p>حالة العرض للزبائن: {store.isOpen ? "مفتوح" : "مغلق حاليًا"}</p></section>}</main></div>;
}

function AccountAccess({ session, onLogout, onPasswordChanged }: { session: Session; onLogout: () => void; onPasswordChanged: () => void }) {
  const access = useQuery(fn("merchant:accessStatus"), sessionArgs(session)) as { status: "active" | "suspended" | "deleted" | "expired" | "not_created" } | undefined;
  if (!access) return <State text="جارٍ التحقق من الحساب…"/>;
  if (access.status === "active") return <Dashboard session={session} onLogout={onLogout} onPasswordChanged={onPasswordChanged}/>;
  const message = access.status === "deleted" ? deletedAccountMessage : access.status === "not_created" ? "الحساب لم يُنشأ بعد." : access.status === "suspended" ? "الحساب موقوف من الإدارة." : "انتهت جلسة الدخول. سجّل الدخول من جديد.";
  return <main className="login"><section className="panel login-card account-blocked"><img className="login-logo" src="./icons/icon-192.png" alt="علاكة سوق"/><h1>تعذر فتح لوحة التاجر</h1><div className="error">{message}</div><button className="primary" onClick={onLogout}>العودة إلى تسجيل الدخول</button></section></main>;
}

function App() {
  const initial = useMemo(() => { try { const value = JSON.parse(localStorage.getItem("alaqa_merchant_session") || "null"); return value?.expiresAt > Date.now() ? value : null; } catch { return null; } }, []);
  const [session, setSession] = useState<Session | null>(initial); const [notice, setNotice] = useState(""); const signOut = useAction(fn("merchantAuth:signOut")); const unregister = useMutation(fn("merchant:unregisterPushDevice"));
  async function logout() { if (session) { try { await unregister({ ...sessionArgs(session), deviceId: deviceId() }); } catch {} try { await signOut({ sessionToken: session.sessionToken }); } catch {} } localStorage.removeItem("alaqa_merchant_session"); setSession(null); }
  function passwordChanged() { localStorage.removeItem("alaqa_merchant_session"); setNotice("تم تغيير كلمة المرور. سجّل الدخول بالكلمة الجديدة."); setSession(null); }
  return session ? <AccountAccess session={session} onLogout={logout} onPasswordChanged={passwordChanged}/> : <Login onDone={value => { setNotice(""); setSession(value); }} notice={notice}/>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><ConvexProvider client={convex}><App/></ConvexProvider></React.StrictMode>);
