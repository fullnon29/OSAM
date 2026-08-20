import "server-only";
import type { Color, PDFFont, PDFPage } from "pdf-lib";

// In the embedded Korean subset font, a space is declared narrow (fontkit
// lays U+0020 out at ~0.28em) but PDF viewers render that glyph far wider,
// closer to a full em. So a string handed to drawText as-is comes out much
// wider than any up-front measurement predicted: text overruns the box it was
// measured to fit, and word gaps look unnaturally wide.
//
// To stay independent of how a viewer treats that glyph, the space glyph is
// never emitted at all: text is split on spaces, each word is drawn at an x we
// compute, and the gap between words is a fixed fraction of the font size.
// measureText mirrors that math exactly, so measured width always equals drawn
// width.
export const SPACE_RATIO = 0.28;

export function measureText(text: string, font: PDFFont, size: number): number {
  const words = text.split(" ");
  let width = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i]) width += font.widthOfTextAtSize(words[i], size);
    if (i < words.length - 1) width += size * SPACE_RATIO;
  }
  return width;
}

export function drawTextRun(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: Color
) {
  const words = text.split(" ");
  let cx = x;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word) {
      page.drawText(word, { x: cx, y, size, font, color });
      cx += font.widthOfTextAtSize(word, size);
    }
    if (i < words.length - 1) cx += size * SPACE_RATIO;
  }
}
