/**
 * Colour model and quantiser.
 *
 * Real flag artwork uses hundreds of slightly different colours: France's blue
 * is not Russia's blue, and anti-aliasing invents shades that exist in neither.
 * Comparing raw pixels would make the Reveal mode feel broken, so every pixel
 * is bucketed into a {@link ColorFamily} and matching happens on families.
 *
 * The enum is numeric on purpose: families are stored in a `Uint8Array`, one
 * byte per pixel.
 */

/** Coarse colour bucket. Two pixels match when their families are equal. */
export enum ColorFamily {
  Unknown = 0,
  Red,
  Maroon,
  Orange,
  Brown,
  Yellow,
  Green,
  Cyan,
  Blue,
  Purple,
  Pink,
  White,
  Gray,
  Black,
}

/** Display metadata for a family, used by legends and colour chips. */
export interface FamilyInfo {
  readonly family: ColorFamily;
  readonly name: string;
  /** Representative swatch colour, `#rrggbb`. */
  readonly hex: string;
}

export const FAMILY_INFO: Readonly<Record<ColorFamily, FamilyInfo>> = {
  [ColorFamily.Unknown]: { family: ColorFamily.Unknown, name: 'Unknown', hex: '#6B7280' },
  [ColorFamily.Red]: { family: ColorFamily.Red, name: 'Red', hex: '#D22630' },
  [ColorFamily.Maroon]: { family: ColorFamily.Maroon, name: 'Maroon', hex: '#7B1113' },
  [ColorFamily.Orange]: { family: ColorFamily.Orange, name: 'Orange', hex: '#F97316' },
  [ColorFamily.Brown]: { family: ColorFamily.Brown, name: 'Brown', hex: '#8B5A2B' },
  [ColorFamily.Yellow]: { family: ColorFamily.Yellow, name: 'Yellow', hex: '#FCD116' },
  [ColorFamily.Green]: { family: ColorFamily.Green, name: 'Green', hex: '#009639' },
  [ColorFamily.Cyan]: { family: ColorFamily.Cyan, name: 'Light blue', hex: '#41B6E6' },
  [ColorFamily.Blue]: { family: ColorFamily.Blue, name: 'Blue', hex: '#0B4EA2' },
  [ColorFamily.Purple]: { family: ColorFamily.Purple, name: 'Purple', hex: '#6D28D9' },
  [ColorFamily.Pink]: { family: ColorFamily.Pink, name: 'Pink', hex: '#E56399' },
  [ColorFamily.White]: { family: ColorFamily.White, name: 'White', hex: '#F4F5F7' },
  [ColorFamily.Gray]: { family: ColorFamily.Gray, name: 'Grey', hex: '#9CA3AF' },
  [ColorFamily.Black]: { family: ColorFamily.Black, name: 'Black', hex: '#15181F' },
};

/** Families ignored when listing "the colours of this flag". */
const TRIVIAL_FAMILIES: ReadonlySet<ColorFamily> = new Set([ColorFamily.Unknown, ColorFamily.Gray]);

export function isNotableFamily(family: ColorFamily): boolean {
  return !TRIVIAL_FAMILIES.has(family);
}

/**
 * Buckets an 8-bit RGB triple into a {@link ColorFamily}.
 *
 * Works in HSV because the interesting distinctions are hue-driven, with
 * value and saturation cut-offs peeled off first: near-black, near-white and
 * washed-out greys never have a meaningful hue.
 */
export function classifyRgb(r: number, g: number, b: number): ColorFamily {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const value = max / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (value < 0.16) return ColorFamily.Black;
  if (saturation < 0.12) {
    if (value > 0.82) return ColorFamily.White;
    if (value > 0.28) return ColorFamily.Gray;
    return ColorFamily.Black;
  }

  const hue = hueOf(r, g, b, max, min);

  // The red wedge is deliberately wide at the magenta end: dark flag reds
  // (Qatar's maroon, Latvia's carmine) land near hue 340 and must not be pink.
  if (hue < 16 || hue >= 335) {
    // Dark reds read as maroon (Qatar, Latvia); everything else is red.
    return value < 0.55 ? ColorFamily.Maroon : ColorFamily.Red;
  }
  if (hue < 45) {
    // Dark, muted orange is brown (the coats of arms and cedar trunks).
    return value < 0.62 && saturation < 0.85 ? ColorFamily.Brown : ColorFamily.Orange;
  }
  if (hue < 70) return value < 0.5 ? ColorFamily.Brown : ColorFamily.Yellow;
  if (hue < 170) return ColorFamily.Green;
  if (hue < 200) return ColorFamily.Cyan;
  if (hue < 255) {
    // Pale, unsaturated blues (Argentina, Somalia) get their own family.
    return value > 0.72 && saturation < 0.55 ? ColorFamily.Cyan : ColorFamily.Blue;
  }
  if (hue < 335) return ColorFamily.Purple;
  return ColorFamily.Pink;
}

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Packs `0xRRGGBB` into a CSS colour string. */
export function rgbToCss(packed: number): string {
  return `#${packed.toString(16).padStart(6, '0')}`;
}
