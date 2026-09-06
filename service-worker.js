self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const data = event.data?.json?.() || {};
  const icon = data.icon || new URL("icons/merchant-192.png", self.registration.scope).href;
  const tag = data.orderId ? `order-${data.orderId}` : data._pushyCollapseKey;
  const options = {
    body: data.message || "لديك تحديث جديد في علاكة سوق",
    icon,
    badge: icon,
    image: data.image,
    data: { url: data.url || self.registration.scope },
    vibrate: [250, 100, 250],
    ...(tag ? { tag, renotify: true } : {}),
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || "إدارة تاجر", options),
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
      data._pushy = true;
      clients.forEach((client) => client.postMessage(data));
    }),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil(self.clients.openWindow(url));
});
