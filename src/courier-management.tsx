import { FormEvent, useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import "./couriers.css";

const fn = (name: string) => name as any;
type MerchantSession = { sessionToken: string; storeId: string; merchantId: string; expiresAt: number };
const merchantArgs = (session: MerchantSession) => ({ sessionToken: session.sessionToken, storeId: session.storeId });
const phoneForWhatsApp = (value: string) => value.replace(/\D/g, "").replace(/^0/, "964");

function courierUrl(courierId: string, storeId: string) {
  const dedicatedUrl = import.meta.env.VITE_COURIER_APP_URL?.trim();
  const baseUrl = dedicatedUrl || (location.hostname === "basmali12.github.io" ? `${location.origin}/alaqa-souq-courier/` : "http://127.0.0.1:4203/");
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
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
    {editing && <CourierForm session={session} value={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onCreated={(courier, link) => { setEditing(null); setInvite({ name: courier.name, whatsapp: courier.whatsapp, link }); }}/>} 
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
