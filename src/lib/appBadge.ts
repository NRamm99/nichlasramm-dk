import { fetchUnreadNotificationCount } from "./matchmaker";

type AppBadgeTarget = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function setAppBadgeCount(count: number) {
  if (typeof navigator === "undefined") return;
  const n = Math.max(0, Math.floor(count));
  try {
    const registration = (
      "serviceWorker" in navigator
        ? await navigator.serviceWorker.ready.catch(() => null)
        : null
    ) as AppBadgeTarget | null;
    const nav = navigator as Navigator & AppBadgeTarget;
    if (n > 0) {
      await registration?.setAppBadge?.(n);
      await nav.setAppBadge?.(n);
      return;
    }
    await registration?.clearAppBadge?.();
    await nav.clearAppBadge?.();
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
