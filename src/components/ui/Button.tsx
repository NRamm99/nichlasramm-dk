import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "./cx";

const variants = {
  primary: "bg-ball text-court hover:bg-line",
  secondary:
    "border border-line/20 text-line hover:border-ball hover:text-ball",
  ghost: "text-ball hover:underline px-0 py-0",
  danger:
    "border border-red-400/40 text-red-300 hover:bg-red-400/10",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  to?: string;
  href?: string;
  target?: string;
  rel?: string;
  download?: string | boolean;
  block?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  to,
  href,
  target,
  rel,
  download,
  block,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = cx(
    "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition touch-manipulation disabled:opacity-60",
    variants[variant],
    block && "w-full",
    className,
  );

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        target={target}
        rel={rel}
        download={download}
      >
        {children}
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
