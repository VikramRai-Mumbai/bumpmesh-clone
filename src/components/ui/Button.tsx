// Shared buttons used by the header, sidebar and menus.

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = Readonly<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "primary";
    size?: "sm" | "md";
  }
>;

const VARIANTS = {
  default: "border-line bg-panel text-fg hover:bg-subtle",
  primary: "border-accent bg-accent text-white hover:opacity-90",
};

const SIZES = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-[13px]",
};

/** Text button with the editor's border style; disabled state is dimmed. */
export function Button({
  variant = "default",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-panel ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}

type IconButtonProps = Readonly<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    children: ReactNode;
  }
>;

/** Square icon-only button; `label` is used for the tooltip and screen readers. */
export function IconButton({
  label,
  children,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      title={label}
      className={`w-8 px-0 ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
}

/** Small "Soon" tag for features planned in later milestones. */
export function SoonBadge() {
  return (
    <span className="rounded bg-subtle px-1.5 py-px text-[10px] font-medium normal-case tracking-normal text-muted">
      Soon
    </span>
  );
}
