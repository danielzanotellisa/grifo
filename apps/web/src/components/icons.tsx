import type { SVGProps } from "react";

/** The icons of the design as inline SVG (ADR 0043): 24 by 24, drawn with the current text color. */
const PATHS = {
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3",
  restore: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4l3 2",
  book: "M3 5.5C5 4.5 8 4.5 12 6c4-1.5 7-1.5 9-.5V19c-2-1-5-1-9 .5-4-1.5-7-1.5-9-.5ZM12 6v13.5",
  edit: "M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  close: "M6 6l12 12M18 6 6 18",
  arrowBack: "M20 12H5M11 6l-6 6 6 6",
  arrowForward: "M4 12h15M13 6l6 6-6 6",
  add: "M12 5v14M5 12h14",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff:
    "M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.3 3.8M6.3 7.8C3.8 9.4 2 12 2 12s4 6 10 6c1.5 0 2.8-.4 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  lock: "M6 11h12v9H6ZM8 11V8a4 4 0 0 1 8 0v3",
  mail: "M4 6h16v12H4ZM4 7l8 6 8-6",
  upload: "M12 16V5M7 9l5-5 5 5M5 20h14",
  file: "M7 3h7l4 4v14H7ZM14 3v4h4M10 12h5M10 16h5",
  hourglass: "M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9",
  error: "M12 8v5M12 16.5v.5M12 3 2 20h20Z",
  info: "M12 11v5M12 8v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  checkCircle: "M8 12.5l3 3 5-6M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  chevronLeft: "M15 5l-7 7 7 7",
  chevronRight: "M9 5l7 7-7 7",
  flashcard: "M4 8l9-3 3 9-9 3ZM8 18l9 3 3-9",
  bookmark: "M7 4h10v16l-5-4-5 4Z",
  list: "M5 6h14M5 12h14M5 18h9",
  external: "M7 17 17 7M9 7h8v8",
  plus: "M12 5v14M5 12h14",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
