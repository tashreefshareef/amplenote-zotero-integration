/**
 * Zotero stores a highlight's color as a hex string (`annotationColor`, e.g. `#ffd400`).
 * The Obsidian reference plugin labels each highlight with a color NAME (`colorCategory`)
 * by bucketing the hex's hue/saturation/lightness — ported here faithfully from its
 * `getColorCategory` (src/bbt/helpers.ts) so the two plugins agree on names, including
 * for custom colors Zotero's preset palette doesn't cover.
 */

function hexToHSL(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function colorCategory(hex) {
  const hsl = hex ? hexToHSL(hex) : null;
  if (!hsl) return "";
  const { h, s, l } = hsl;
  if (l < 12) return "Black";
  if (l > 98) return "White";
  if (s < 2) return "Gray";
  if (h < 15) return "Red";
  if (h < 45) return "Orange";
  if (h < 65) return "Yellow";
  if (h < 170) return "Green";
  if (h < 190) return "Cyan";
  if (h < 255) return "Blue";
  if (h < 280) return "Purple";
  if (h < 335) return "Magenta";
  return "Red";
}
