"use client";

import { useState, type ReactNode, type Ref } from "react";
import { Icon, type IconName } from "../../components/icons";
import { inputClass } from "../../components/styles";

export function TextField(props: {
  id: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | undefined;
  inputRef?: Ref<HTMLInputElement>;
  icon?: IconName;
  /** Something to the right of the label, like the link to ask for a new password. */
  labelAction?: ReactNode;
  /** The names of the button that shows the typed characters of a password; they avoid the word of the label. */
  revealLabels?: { show: string; hide: string };
}) {
  const [revealed, setRevealed] = useState(false);
  const hintId = `${props.id}-hint`;
  const errorId = `${props.id}-error`;
  const isPassword = props.type === "password";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={props.id} className="text-sm font-medium text-ink-black">
          {props.label}
        </label>
        {props.labelAction}
      </div>
      <div className="relative">
        {props.icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
            <Icon name={props.icon} size={16} />
          </span>
        ) : null}
        <input
          id={props.id}
          ref={props.inputRef}
          type={isPassword && revealed ? "text" : (props.type ?? "text")}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={
            [props.hint ? hintId : null, props.error ? errorId : null].filter(Boolean).join(" ") ||
            undefined
          }
          className={`${inputClass} ${props.icon ? "pl-9" : ""} ${isPassword && props.revealLabels ? "pr-10" : ""} ${props.error ? "border-error" : ""}`}
        />
        {isPassword && props.revealLabels ? (
          <button
            type="button"
            aria-label={revealed ? props.revealLabels.hide : props.revealLabels.show}
            aria-pressed={revealed}
            onClick={() => setRevealed((v) => !v)}
            className="absolute inset-y-0 right-2 flex items-center px-1 text-ink-muted hover:text-ink"
          >
            <Icon name={revealed ? "eyeOff" : "eye"} size={16} />
          </button>
        ) : null}
      </div>
      {props.hint ? (
        <p id={hintId} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Icon name="info" size={13} />
          {props.hint}
        </p>
      ) : null}
      {props.error ? (
        <p id={errorId} role="alert" className="text-sm text-error">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
