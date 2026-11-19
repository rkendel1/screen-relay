/** The deterministic fixture (fixture/index.html): where its controls are, what to type, and how to read its state from a screenshot. */
import { PNG } from "pngjs";

export const FIXTURE = {
  value: "relay-lab-42",
  input: { x: 0.5, y: 0.42 },
  button: { x: 0.5, y: 0.6 },
  banner: { x: 0.5, y: 0.12 },
} as const;

const STATES = { ready: [37, 99, 235], success: [22, 163, 74], failure: [220, 38, 38] } as const;
export type FixtureState = keyof typeof STATES | "unknown";

/** The fixture's state, read from the banner color at a fixed point of a PNG screenshot. */
export function fixtureState(png: Uint8Array): { state: FixtureState; rgb: [number, number, number] } {
  const image = PNG.sync.read(Buffer.from(png));
  const x = Math.round(FIXTURE.banner.x * (image.width - 1));
  const y = Math.round(FIXTURE.banner.y * (image.height - 1));
  const at = (y * image.width + x) * 4;
  const rgb: [number, number, number] = [image.data[at]!, image.data[at + 1]!, image.data[at + 2]!];
  for (const [state, color] of Object.entries(STATES)) {
    if (color.every((value, index) => Math.abs(value - rgb[index]!) <= 24)) return { state: state as FixtureState, rgb };
  }
  return { state: "unknown", rgb };
}

/** Width and height of a PNG, from its header. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
