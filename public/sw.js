self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function setUnreadBadge(count) {
  const n = Number(count);
  try {
    if (n > 0 && self.registration.setAppBadge) {
      await self.registration.setAppBadge(n);
      return;
    }
    if (self.registration.clearAppBadge) {
      await self.registration.clearAppBadge();
    }
  } catch {
    /* iOS only shows a home-screen badge for an installed web app. */
  }
}

self.addEventListener("push", (event) => {
  let data = {
    title: "Padel By Ramm",
    body: "Der er nyt i klubben.",
    href: "/nyt",
    unread: 1,
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || "Padel By Ramm", {
        body: data.body,
        icon: "/apple-touch-icon.png",
        badge: "/icons/icon-192.png",
        data: { href: data.href || "/nyt" },
      });
      await setUnreadBadge(data.unread ?? 1);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/nyt";
  const url = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
