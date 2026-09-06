import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const courierSource = fs.readFileSync(new URL("../src/couriers.tsx", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const vite = fs.readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const courierManifest = JSON.parse(fs.readFileSync(new URL("../public/courier.webmanifest", import.meta.url), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("GitHub Pages build uses relative assets and has no localhost dependency", () => {
  assert.match(vite, /base:\s*"\.\/"/);
  assert.doesNotMatch(source, /localhost|127\.0\.0\.1/);
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
});

test("merchant PWA uses the إدارة تاجر identity and supplied merchant artwork", () => {
  assert.equal(manifest.name, "إدارة تاجر");
  assert.equal(manifest.short_name, "إدارة تاجر");
  assert.equal(manifest.icons[0].src, "./icons/merchant-192.png");
  assert.equal(manifest.icons[1].src, "./icons/merchant-512.png");
  assert.ok(fs.statSync(new URL("../public/icons/merchant-192.png", import.meta.url)).size > 0);
  assert.ok(fs.statSync(new URL("../public/icons/merchant-512.png", import.meta.url)).size > 0);
  assert.match(html, /<title>إدارة تاجر<\/title>/);
  assert.match(html, /icons\/merchant-192\.png/);
  assert.match(source, /icons\/merchant-512\.png/);
  assert.match(source, /تثبيت إدارة تاجر/);
});

test("store hint never replaces server-side merchant session ownership", () => {
  assert.match(source, /result\.storeId !== storeFromUrl/);
  assert.match(source, /sessionToken: session\.sessionToken, storeId: session\.storeId/);
});

test("Pushy registration stores the token through Convex and never embeds the secret", () => {
  assert.match(source, /merchant:registerPushDevice/);
  assert.match(source, /window\.Pushy\.register/);
  assert.doesNotMatch(source, /SECRET_API_KEY|PUSHY_SECRET_API_KEY/);
});

test("merchant orders expose only the next valid workflow action and customer location", () => {
  assert.match(source, /accepted: \["preparing", "بدء التحضير"\]/);
  assert.match(source, /preparing: \["ready", "جاهز"\]/);
  assert.match(source, /out_for_delivery: \["delivered", "تم التسليم"\]/);
  assert.match(source, /geo:\$\{order\.latitude\},\$\{order\.longitude\}/);
  assert.match(source, /اسم الزبون:/);
  assert.match(source, /المحافظة:/);
  assert.match(source, /أقرب نقطة دالة:/);
  assert.match(source, /https:\/\/wa\.me\//);
  assert.match(source, /مراسلة الزبون عبر واتساب/);
  assert.doesNotMatch(source, /status: "completed"/);
});

test("deleted and missing merchant accounts have explicit permanent access messages", () => {
  assert.match(source, /MERCHANT_ACCOUNT_DELETED/);
  assert.match(source, /MERCHANT_ACCOUNT_NOT_CREATED/);
  assert.match(source, /تم حذف حسابك نهائيًا/);
  assert.match(source, /الحساب لم يُنشأ بعد/);
  assert.match(source, /merchant:accessStatus/);
});

test("merchant signs in by phone and can change a password of eight characters or more", () => {
  assert.match(source, /name="phone"/);
  assert.match(source, /phone: String\(data\.get\("phone"\)\)/);
  assert.doesNotMatch(source, /name="username"/);
  assert.match(source, /merchantAuth:changePassword/);
  assert.match(source, /name="currentPassword"/);
  assert.match(source, /name="newPassword"[^>]*minLength=\{8\}/);
  assert.match(source, /تم تغيير كلمة المرور/);
});

test("merchant courier tab supports secure CRUD, invitation and order assignment", () => {
  assert.match(source, /\["couriers", "المندوبون"\]/);
  assert.match(courierSource, /courierAuth:create/);
  assert.match(courierSource, /courier:updateForMerchant/);
  assert.match(courierSource, /courier:setFrozenForMerchant/);
  assert.match(courierSource, /courier:deleteForMerchant/);
  assert.match(courierSource, /courier:assignOrder/);
  assert.match(courierSource, /إرسال عبر واتساب/);
  assert.match(courierSource, /alaqa-souq-courier/);
  assert.match(courierSource, /name="password"[^>]*minLength=\{8\}/);
  assert.doesNotMatch(courierSource, /PUSHY_SECRET_API_KEY|SECRET_API_KEY/);
});

test("courier PWA persists its session and blocks the dashboard until push registration", () => {
  assert.match(courierSource, /alaqa_courier_session/);
  assert.match(courierSource, /alaqa_courier_push_/);
  assert.match(courierSource, /courier:registerPushDevice/);
  assert.match(courierSource, /تفعيل الإشعارات مطلوب/);
  assert.match(courierSource, /if \(!pushReady\) return <NotificationGate/);
  assert.match(courierSource, /courier:listMyOrders/);
});

test("courier has its own brand assets and requires installation before sign-in", () => {
  assert.equal(courierManifest.name, "مندوب علاكة سوك");
  assert.equal(courierManifest.display, "standalone");
  assert.equal(courierManifest.icons[0].src, "./icons/courier-192.png");
  assert.equal(courierManifest.icons[1].src, "./icons/courier-512.png");
  assert.ok(fs.statSync(new URL("../public/icons/courier-192.png", import.meta.url)).size > 0);
  assert.ok(fs.statSync(new URL("../public/icons/courier-512.png", import.meta.url)).size > 0);
  assert.match(courierSource, /if \(!standalone\) return <PwaInstallGate/);
  assert.match(courierSource, /beforeinstallprompt/);
  assert.match(courierSource, /navigator\.serviceWorker\.register/);
  assert.match(courierSource, /basePath\.replace\(\/\^\\\/\+\/, ""\)/);
  assert.match(courierSource, /appId: pushyAppId, serviceWorkerFile, serviceWorkerScope: basePath/);
  assert.match(source, /import\.meta\.env\.MODE === "courier"/);
  assert.match(packageJson.scripts["build:courier"], /--mode courier/);
  assert.match(vite, /courier-pwa-identity/);
  assert.match(vite, /courier\.webmanifest/);
  assert.match(html, /courier\.webmanifest/);
  assert.match(html, /courier-192\.png/);
  assert.match(courierSource, /إضافة إلى الشاشة الرئيسية/);
  assert.match(courierSource, /افتح الرابط في Safari/);
});
