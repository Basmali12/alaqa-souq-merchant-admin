import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const vite = fs.readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

test("GitHub Pages build uses relative assets and has no localhost dependency", () => {
  assert.match(vite, /base:\s*"\.\/"/);
  assert.doesNotMatch(source, /localhost|127\.0\.0\.1/);
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
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
  assert.doesNotMatch(source, /status: "completed"/);
});
