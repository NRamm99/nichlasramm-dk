import { fetchUnreadNotificationCount } from "./matchmaker";

export async function setAppBadgeCount(count: number) {
  if (typeof navigator === "undefined") return;
  const n = Math.max(0, Math.floor(count));
  try {
    const registration = "serviceWorker" in navigator
      ? await navigator.serviceWorker.ready.catch(() => null)
      : null;
    if (n > 0) {
      if (registration && "setAppBadge" in registration) {
        await registration.setAppBadge(n);
      }
      if ("setAppBadge" in navigator) {
        await navigator.setAppBadge(n);
      }
      return;
    }
    if (registration && "clearAppBadge" in registration) {
      await registration.clearAppBadge();
    }
    if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }
  } catch {
    /* Not an installed PWA, or the browser blocks badging. */
  }
}

export async function syncAppBadge() {
  try {
    await setAppBadgeCount(await fetchUnreadNotificationCount());
  } catch {
    /* Ignore while logged out or offline. */
  }
}
