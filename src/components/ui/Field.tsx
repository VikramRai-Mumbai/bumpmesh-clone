// Form controls styled like the reference sidebar: checkbox, slider with number box, select, help tip.

import { type ReactNode, useState } from "react";

/** Small circled "i" with a native tooltip. */
export function InfoTip({ text }: Readonly<{ text: string }>) {
  return (
    <span
      title={text}
      className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-muted text-[9px] leading-none text-muted"
    >
      i
    </span>
  );
}

type CheckboxProps = Readonly<{
  label: ReactNode;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
}>;

/** Labelled checkbox; the whole label is clickable. */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  title,
}: CheckboxProps) {
  return (
    <label
      title={title}
      className={`flex items-center gap-1.5 text-xs ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="h-3.5 w-3.5 accent-accent"
      />
      {label}
    </label>
  );
}

type SliderProps = Readonly<{
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Called continuously while dragging (live preview). */
  onChange?: (value: number) => void;
  /** Called once when the user lets go or confirms a typed value. */
  onCommit?: (value: number) => void;
  disabled?: boolean;
}>;

/**
 * Label, range slider and number box, as in the reference sidebar.
 * Dragging reports `onChange` for live preview and `onCommit` once on release,
 * so a whole drag becomes a single undo step. Typed values commit on Enter or blur.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  disabled,
}: SliderProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const [text, setText] = useState<string | null>(null);
  const shown = drag ?? value;

  // Ends a drag: commit the last dragged value.
  function finishDrag() {
    if (drag === null) return;
    onCommit?.(drag);
    setDrag(null);
  }

  // Applies the typed number, clamped to the slider range.
  function finishTyping() {
    if (text === null) return;
    const parsed = Number(text);
    if (text.trim() !== "" && Number.isFinite(parsed)) {
      onCommit?.(Math.min(max, Math.max(min, parsed)));
    }
    setText(null);
  }

  return (
    <div
      className={`grid grid-cols-[minmax(0,8.75rem)_1fr_3.5rem] items-center gap-2 text-xs ${disabled ? "opacity-50" : ""}`}
    >
      <span className="truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDrag(v);
          onChange?.(v);
        }}
        onPointerUp={finishDrag}
        onKeyUp={finishDrag}
        onBlur={finishDrag}
        className="w-full disabled:cursor-not-allowed"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={text ?? String(Number(shown.toFixed(4)))}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={finishTyping}
        onKeyDown={(e) => {
          if (e.key === "Enter") finishTyping();
          if (e.key === "Escape") setText(null);
        }}
        className="h-6 w-full rounded border border-line bg-panel px-1.5 text-right text-xs disabled:cursor-not-allowed"
      />
    </div>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = Readonly<{
  label: ReactNode;
  value: string;
  options: (string | SelectOption)[];
  onChange?: (value: string) => void;
  disabled?: boolean;
}>;

/** Label plus a native dropdown; options can be individually disabled. */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: SelectProps) {
  return (
    <label
      className={`grid grid-cols-[minmax(0,5.5rem)_1fr] items-center gap-2 text-xs ${disabled ? "opacity-50" : ""}`}
    >
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-7 rounded border border-line bg-panel px-2 text-xs disabled:cursor-not-allowed"
      >
        {options.map((option) => {
          const o =
            typeof option === "string"
              ? { value: option, label: option }
              : option;
          return (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
