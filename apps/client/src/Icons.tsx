import type { ReactNode } from "react";

/** The drawing of each icon: simple strokes on a 24 square, in the current color, like the mark of the table. */
const PATHS = {
  move: <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v5.5a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.4 15a1.5 1.5 0 0 1 2.4-1.8L9 15.5V11" />,
  select: <path d="M5 4l5.5 15 2.3-6.2L19 10.5 5 4zM13 13l5 5" />,
  measure: <path d="M3.5 17.5 17.5 3.5l3 3-14 14-3-3zM7 14l2 2m1-5 2 2m1-5 2 2" />,
  pointer: <><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="8" /></>,
  text: <path d="M5 6V4.5h14V6M12 4.5v15m-3 0h6" />,
  library: <><rect x="4" y="7" width="12" height="13" rx="1.5" /><path d="M8 4h10a2 2 0 0 1 2 2v11" /></>,
  zone: <><rect x="4" y="5.5" width="16" height="13" rx="1.5" strokeDasharray="3 2.5" /><path d="M12 9.5v5M9.5 12h5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  "eye-off": <path d="M3 3l18 18M10.6 6a8.600 8.600 0 0 1 1.400-.1C18 5.900 21.500 12 21.500 12a17 17 0 0 1-3 3.700M6.700 7.300A16 16 0 0 0 2.500 12S6 18.100 12 18.100a8.700 8.700 0 0 0 3.300-.7M9.900 9.900a3 3 0 0 0 4.200 4.200" />,
  copy: <><rect x="8.500" y="8.500" width="11" height="11" rx="2" /><path d="M15.500 8.500v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12.200a1.800 1.800 0 0 0 1.800 1.600h6.400a1.800 1.800 0 0 0 1.800-1.600L18 7M9 7V4.500h6V7" />,
  more: <><circle cx="12" cy="5.500" r="1.200" /><circle cx="12" cy="12" r="1.200" /><circle cx="12" cy="18.500" r="1.200" /></>,
  chat: <path d="M4 5.500h16v10.500H10l-4.500 3.500V16H4z" />,
  players: <><circle cx="9" cy="8.500" r="3.200" /><path d="M3 19.500a6 6 0 0 1 12 0M16 5.500a3.200 3.200 0 0 1 0 6m2 1.800a6 6 0 0 1 3 6.200" /></>,
  scenes: <><rect x="3.500" y="5" width="17" height="14" rx="2" /><path d="M3.500 15l4.500-4.500 4 4 3-3 5.500 5M9 9.500h.01" /></>,
  token: <><circle cx="12" cy="12" r="8.500" /><circle cx="12" cy="9.500" r="2.800" /><path d="M6.700 17.500a6 6 0 0 1 10.600 0" /></>,
  grid: <path d="M4 4h16v16H4zM4 9.300h16M4 14.700h16M9.300 4v16m5.400-16v16" />,
  exit: <path d="M14 4.500H6.500a1.500 1.500 0 0 0-1.500 1.500v12a1.500 1.500 0 0 0 1.500 1.500H14M10 12h10m-3.500-3.500L20 12l-3.500 3.500" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  rectangle: <path d="M5 5h14v14H5z" strokeDasharray="3 2.500" />,
  lasso: <path d="M12 4.500c4.700 0 8 2 8 4.700s-3.300 4.800-8 4.800c-.9 0-1.800-.1-2.600-.2M4 9.200C4 6.500 7.300 4.500 12 4.500M9.400 13.800C7 14.400 4 13 4 9.200m5.400 4.600L8 19.500m0 0h3m-3 0-1.500-3" />,
  ruler: <path d="M3.500 17.500 17.500 3.500l3 3-14 14-3-3zM7 14l2 2m1-5 2 2m1-5 2 2" />,
  radius: <><circle cx="12" cy="12" r="8.500" /><path d="M12 12l6-6" /><circle cx="12" cy="12" r="1.100" /></>,
  reset: <path d="M4 12a8 8 0 1 0 2.400-5.700M4 4.500v4.200h4.200" />,
  sync: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3m0 12v3M3 12h3m12 0h3" /></>,
  help: <><circle cx="12" cy="12" r="8.500" /><path d="M9.700 9.500a2.400 2.400 0 1 1 3.300 2.200c-.7.400-1 .9-1 1.600M12 16.800h.01" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pin: <><path d="M12 21s6.500-6 6.500-11.200a6.500 6.500 0 0 0-13 0C5.500 15 12 21 12 21z" /><circle cx="12" cy="9.800" r="2.300" /></>,
  enter: <path d="M5 12h13M13 6.500 18.500 12 13 17.500" />,
  link: <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" />,
  lock: <><rect x="5" y="10.500" width="14" height="9.500" rx="2" /><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500" /></>,
  unlock: <><rect x="5" y="10.500" width="14" height="9.500" rx="2" /><path d="M8 10.500V8a4 4 0 0 1 7.500-1.900" /></>,
  fit: <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />,
  minus: <path d="M5 12h14" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/** An icon. It is decoration: the button around it carries the name, so it is hidden from screen readers. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="icon">
      {PATHS[name]}
    </svg>
  );
}
