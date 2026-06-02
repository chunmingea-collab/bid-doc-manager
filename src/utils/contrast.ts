/**
 * WCAG 2.x relative-contrast utility. Returns a number in [1, 21]:
 *  - 4.5  = AA pass for normal text
 *  - 3.0  = AA pass for large text or UI components (>= 18pt / 14pt bold)
 *  - 7.0  = AAA pass for normal text
 */
export function relativeLuminance(hex: string): number {
  const s = hex.replace("#", "");
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastVerdict {
  fg: string;
  bg: string;
  ratio: number;
  aa: boolean;
  aaLarge: boolean;
  aaa: boolean;
  uiComponent: boolean;
}

/**
 * Verdict for a foreground/background pair. The Antd dark theme uses
 * #141414 for the page background and #1f1f1f for cards; light theme
 * uses #ffffff / #fafafa.
 */
export function judgeContrast(fg: string, bg: string): ContrastVerdict {
  const ratio = contrastRatio(fg, bg);
  return {
    fg,
    bg,
    ratio,
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
    uiComponent: ratio >= 3,
  };
}
