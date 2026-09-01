import { useEffect, useState } from "react";
import { danishAuthError } from "../lib/authErrors";
import {
  currentPushEnabled,
  disablePushNotifications,
  enablePushNotifications,
  isIosDevice,
  isStandaloneDisplay,
  pushSupported,
  syncPushSubscription,
} from "../lib/push";

export function PushNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = pushSupported();
  const iosNeedsInstall = isIosDevice() && !isStandaloneDisplay();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await syncPushSubscription();
        const on = await currentPushEnabled();
        if (!cancelled) setEnabled(on);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setError(null);
    setBusy(true);
    try {
      await enablePushNotifications();
      setEnabled(true);
    } catch (turnOnError) {
      const message =
        turnOnError instanceof Error ? turnOnError.message : "PUSH_SUBSCRIBE_FAILED";
      setError(danishAuthError(message));
    }
    setBusy(false);
  }

  async function turnOff() {
    setError(null);
    setBusy(true);
    try {
      await disablePushNotifications();
      setEnabled(false);
    } catch (turnOffError) {
      const message =
        turnOffError instanceof Error ? turnOffError.message : "PUSH_SUBSCRIBE_FAILED";
      setError(danishAuthError(message));
    }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-line/10 bg-court px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
        Push-beskeder
      </p>
      {iosNeedsInstall ? (
        <p className="mt-2 text-sm text-line/70">
          På iPhone: Del → Føj til hjemmeskærm. Åbn appen derfra, og slå
          beskeder til.
        </p>
      ) : !supported ? (
        <p className="mt-2 text-sm text-line/70">
          Din browser understøtter ikke push-beskeder.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-line/70">
            Få besked, når der sker noget i klubben — også når appen er lukket.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void (enabled ? turnOff() : turnOn())}
            className="mt-3 rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
          >
            {busy
              ? "Vent…"
              : enabled
                ? "Slå beskeder fra"
                : "Slå beskeder til"}
          </button>
        </>
      )}
      {error ? (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
