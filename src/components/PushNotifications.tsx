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
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

export function PushNotifications({
  hideWhenEnabled = false,
  compact = false,
}: {
  hideWhenEnabled?: boolean;
  compact?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
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
      } finally {
        if (!cancelled) setReady(true);
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

  if (!ready) return null;
  if (hideWhenEnabled && enabled && !error) return null;

  return (
    <Card className={compact ? "px-4 py-3" : "px-4 py-4"}>
      <p className="ui-label">Push-beskeder</p>
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
          {compact ? null : (
            <p className="mt-2 text-sm text-line/70">
              Få besked, når der sker noget i klubben — også når appen er lukket.
            </p>
          )}
          <Button
            variant={enabled ? "secondary" : compact ? "secondary" : "primary"}
            disabled={busy}
            className="mt-3 text-xs"
            onClick={() => void (enabled ? turnOff() : turnOn())}
          >
            {busy
              ? "Vent…"
              : enabled
                ? "Slå beskeder fra"
                : "Slå beskeder til"}
          </Button>
        </>
      )}
      {error ? (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
