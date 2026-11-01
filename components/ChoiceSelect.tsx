"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type ChoiceOption = { value: string; label: string; description?: string };

export default function ChoiceSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "请选择",
  disabled = false,
}: {
  label: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const closeMenu = useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimer.current = null;
    }, 160);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        root.current?.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, [open, closeMenu]);

  const selected = options.find((option) => option.value === value);

  return (
    <div className={`choice-select${open ? " is-open" : ""}`} ref={root}>
      <button
        type="button"
        className="choice-select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open && !closing}
        aria-controls={id}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
          if (open && !closing) closeMenu();
          else { setClosing(false); setOpen(true); }
        }}
      >
        <span>{selected?.label || placeholder}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <div className={`choice-select-menu${closing ? " is-closing" : ""}`} id={id} role="listbox" aria-label={label} aria-hidden={closing || undefined}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={`choice-select-option${value === option.value ? " selected" : ""}`}
              key={option.value || "empty"}
              onClick={() => { onChange(option.value); closeMenu(); }}
            >
              <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
              {value === option.value && <Check size={17} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
