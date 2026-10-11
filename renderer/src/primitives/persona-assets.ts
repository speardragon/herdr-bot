/**
 * Persona mascot art -- owned project assets. Two resolutions ship per color: the full 288px mascot for
 * anything 32px and up, and a pre-cropped 160px "mask" variant intended for small sizes
 * (presence-strip/room-stack avatars down to ~20px) where the full image would look soft.
 */
import type { PersonaColor } from "../data/avatar-colors.ts";

import black from "../assets/persona-avatars/black-bot.png";
import blue from "../assets/persona-avatars/blue-bot.png";
import brown from "../assets/persona-avatars/brown-bot.png";
import cyan from "../assets/persona-avatars/cyan-bot.png";
import gray from "../assets/persona-avatars/gray-bot.png";
import green from "../assets/persona-avatars/green-bot.png";
import magenta from "../assets/persona-avatars/magenta-bot.png";
import orange from "../assets/persona-avatars/orange-bot.png";
import red from "../assets/persona-avatars/red-bot.png";
import violet from "../assets/persona-avatars/violet-bot.png";
import yellow from "../assets/persona-avatars/yellow-bot.png";

import blackMask from "../assets/persona-avatars/masks/black-bot-mask.png";
import blueMask from "../assets/persona-avatars/masks/blue-bot-mask.png";
import brownMask from "../assets/persona-avatars/masks/brown-bot-mask.png";
import cyanMask from "../assets/persona-avatars/masks/cyan-bot-mask.png";
import grayMask from "../assets/persona-avatars/masks/gray-bot-mask.png";
import greenMask from "../assets/persona-avatars/masks/green-bot-mask.png";
import magentaMask from "../assets/persona-avatars/masks/magenta-bot-mask.png";
import orangeMask from "../assets/persona-avatars/masks/orange-bot-mask.png";
import redMask from "../assets/persona-avatars/masks/red-bot-mask.png";
import violetMask from "../assets/persona-avatars/masks/violet-bot-mask.png";
import yellowMask from "../assets/persona-avatars/masks/yellow-bot-mask.png";

export const PERSONA_FULL: Record<PersonaColor, string> = { black, blue, brown, cyan, gray, green, magenta, orange, red, violet, yellow };

/** `masks/*-bot-mask.png` are 160px crops -- used below `SMALL_ASSET_THRESHOLD_PX`. */
export const PERSONA_SMALL: Record<PersonaColor, string> = {
  black: blackMask,
  blue: blueMask,
  brown: brownMask,
  cyan: cyanMask,
  gray: grayMask,
  green: greenMask,
  magenta: magentaMask,
  orange: orangeMask,
  red: redMask,
  violet: violetMask,
  yellow: yellowMask,
};

export const SMALL_ASSET_THRESHOLD_PX = 32;

export function personaAssetFor(color: PersonaColor, renderSizePx: number): string {
  return renderSizePx < SMALL_ASSET_THRESHOLD_PX ? PERSONA_SMALL[color] : PERSONA_FULL[color];
}
