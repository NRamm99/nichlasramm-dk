import {
  useLayoutEffect,
  useRef,
  type ReactNode,
  type UIEvent,
} from "react";
import { Button } from "./ui/Button";

export function ChatThread({
  header,
  footer,
  children,
  scrollKey,
  fill = false,
  pin,
}: {
  header?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  scrollKey: string | number;
  fill?: boolean;
  pin?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }

  useLayoutEffect(() => {
    if (pin == null) return;
    stickToBottom.current = true;
  }, [pin]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollKey, pin]);

  return (
    <div
      className={`flex min-h-0 flex-col ${
        fill ? "flex-1" : "h-[min(22rem,calc(100dvh-14rem))]"
      }`}
    >
      {header}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {children}
      </div>
      <div
        className={`shrink-0 border-t border-line/10 pt-3 ${
          fill
            ? "bg-court/95 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            : "pb-0"
        }`}
      >
        {footer}
      </div>
    </div>
  );
}

export function ChatComposer({
  id,
  value,
  onChange,
  onSubmit,
  sending,
  placeholder,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex items-end gap-2"
    >
      <label className="sr-only" htmlFor={id}>
        Besked
      </label>
      <textarea
        id={id}
        required
        maxLength={1000}
        rows={2}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!disabled && !sending && value.trim()) onSubmit();
          }
        }}
        className="max-h-28 min-h-11 w-full flex-1 resize-none appearance-none rounded-2xl border border-line/15 bg-court px-4 py-2.5 text-base shadow-none outline-none focus:border-ball disabled:opacity-60"
      />
      <Button
        type="submit"
        disabled={disabled || sending || !value.trim()}
        className="shrink-0 px-4 shadow-none"
      >
        {sending ? "…" : "Send"}
      </Button>
    </form>
  );
}
