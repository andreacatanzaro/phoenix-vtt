import { TOKEN_COLORS, type TokenColor } from "@phoenix/shared";

/** The colors the canvas needs as numbers, read from the design variables so the board follows the style sheet. */
export type Palette = {
  night: number;
  slate: number;
  line: number;
  bone: number;
  mist: number;
  gold: number;
  green: number;
  ember: number;
  tokens: Record<TokenColor, number>;
  ui: string;
};

const FALLBACK = 0x808080;

/** "#rrggbb" or "#rgb" as a number; anything else gives grey. */
export function parseColor(value: string): number {
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value.trim());
  if (hex?.[1] === undefined) return FALLBACK;
  const digits = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
  return Number.parseInt(digits, 16);
}

export function readPalette(root: HTMLElement = document.documentElement): Palette {
  const style = getComputedStyle(root);
  const color = (name: string): number => parseColor(style.getPropertyValue(name));
  const tokens = Object.fromEntries(TOKEN_COLORS.map((name) => [name, color(`--tk-${name}`)]));
  const pick = (name: TokenColor): number => tokens[name] ?? FALLBACK;
  return {
    night: color("--notte"),
    slate: color("--lavagna"),
    line: color("--traccia"),
    bone: color("--osso"),
    mist: color("--nebbia"),
    gold: color("--oro"),
    green: color("--verderame"),
    ember: color("--brace"),
    tokens: { gold: pick("gold"), green: pick("green"), red: pick("red"), blue: pick("blue"), violet: pick("violet"), grey: pick("grey"), white: pick("white"), black: pick("black") },
    ui: style.getPropertyValue("--ui").trim() || "sans-serif",
  };
}
