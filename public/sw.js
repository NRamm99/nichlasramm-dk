self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function unreadFromPayload(data) {
  const raw = data.unread ?? data.app_badge ?? data.badge;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function setUnreadBadge(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  try {
    if (n > 0) {
      if (self.navigator?.setAppBadge) {
        await self.navigator.setAppBadge(n);
      }
      if (self.registration.setAppBadge) {
        await self.registration.setAppBadge(n);
      }
    } else {
      if (self.navigator?.clearAppBadge) {
        await self.navigator.clearAppBadge();
      }
      if (self.registration.clearAppBadge) {
        await self.registration.clearAppBadge();
      }
    }
  } catch {
    /* iOS only shows a home-screen badge for an installed web app. */
  }

  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    client.postMessage({ type: "APP_BADGE", count: n });
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

  const unread = unreadFromPayload(data);

  event.waitUntil(
    (async () => {
      await setUnreadBadge(unread);
      await self.registration.showNotification(data.title || "Padel By Ramm", {
        body: data.body,
        icon: "/apple-touch-icon.png",
        data: { href: data.href || "/nyt" },
      });
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
