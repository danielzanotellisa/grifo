import type { Ref } from "react";

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
}) {
  const hintId = `${props.id}-hint`;
  const errorId = `${props.id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      <input
        id={props.id}
        ref={props.inputRef}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={
          [props.hint ? hintId : null, props.error ? errorId : null].filter(Boolean).join(" ") ||
          undefined
        }
        className="rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20"
      />
      {props.hint ? (
        <p id={hintId} className="text-sm text-neutral-500">
          {props.hint}
        </p>
      ) : null}
      {props.error ? (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
