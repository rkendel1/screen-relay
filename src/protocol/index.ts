import { RelayError } from './errors.js';
export { RelayError, ERROR_REASONS, networkError, responseError } from './errors.js';
export type { ErrorClass, ErrorReason, ErrorOptions, NextCommand } from './errors.js';

export const MAGIC = 0x4e534c31;
export const VERSION = 1;
export const HEADER_SIZE = 20;
export const INPUT_SIZE = 16;
export const MAX_INPUT_BATCH = 256;
export const MAX_INPUT_PENDING = 32;
export const MAX_WIDTH = 65535;
export const MAX_HEIGHT = 65535;
export const MAX_BYTES_IN_FLIGHT = 8388608;
export const SUBPROTOCOL = 'nsl1';
export const MESSAGE_TYPES = { frame: 1, ack: 2, input: 3, controlReady: 4, inputResponse: 5, cursor: 6 } as const;
export const INPUT_TYPES = { keyDown: 1, keyUp: 2, pointerMove: 3, buttonDown: 4, buttonUp: 5, wheel: 6, releaseAll: 7, text: 8 } as const;

export type InputEvent = (
  | { type: 'keyDown' | 'keyUp'; key: number }
  | { type: 'pointerMove'; x: number; y: number }
  | { type: 'buttonDown' | 'buttonUp'; button: 1 | 2 | 3; x: number; y: number }
  | { type: 'wheel'; axis: 'vertical' | 'horizontal'; delta: number; x: number; y: number }
  | { type: 'releaseAll' }
  | { type: 'text'; codepoint: number }
) & { buttons?: number; modifiers?: number };

export function integer(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RelayError('invalid_input', `Invalid ${name}`);
  return value;
}

export function coordinate(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new RelayError('invalid_input', `Invalid ${name}`);
  return Math.round(value * 65535);
}

export function encodeInputRecord(event: InputEvent): Uint8Array<ArrayBuffer> {
  if (!event || typeof event !== 'object' || !Object.hasOwn(INPUT_TYPES, event.type)) throw new RelayError('invalid_input', 'Unknown input type');
  const bytes = new Uint8Array(INPUT_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, INPUT_TYPES[event.type]);
  const buttons = integer(event.buttons ?? 0, 0, 31, 'buttons');
  const modifiers = integer(event.modifiers ?? 0, 0, 255, 'modifiers');
  if ((event.type === 'releaseAll' || event.type === 'text') && (buttons || modifiers)) throw new RelayError('invalid_input', 'Release and text events require zero masks');
  view.setUint16(12, buttons);
  view.setUint16(14, modifiers);
  if (event.type === 'pointerMove' || event.type === 'buttonDown' || event.type === 'buttonUp' || event.type === 'wheel') {
    view.setUint16(8, coordinate(event.x, 'x'));
    view.setUint16(10, coordinate(event.y, 'y'));
  }
  if (event.type === 'keyDown' || event.type === 'keyUp') view.setUint16(2, integer(event.key, 0, 231, 'key'));
  if (event.type === 'buttonDown' || event.type === 'buttonUp') view.setUint16(2, integer(event.button, 1, 3, 'button'));
  if (event.type === 'wheel') {
    if (event.axis !== 'vertical' && event.axis !== 'horizontal') throw new RelayError('invalid_input', 'Invalid wheel axis');
    const delta = integer(event.delta, -1200, 1200, 'wheel delta');
    if (delta % 120) throw new RelayError('invalid_input', 'Wheel delta must be a multiple of 120');
    view.setUint16(2, event.axis === 'horizontal' ? 1 : 0);
    view.setInt32(4, delta);
  }
  if (event.type === 'text') {
    const codepoint = integer(event.codepoint, 1, 0x10ffff, 'Unicode scalar');
    if (codepoint >= 0xd800 && codepoint <= 0xdfff) throw new RelayError('invalid_input', 'Invalid Unicode scalar');
    view.setInt32(4, codepoint);
    view.setUint16(8, 0);
    view.setUint16(10, 0);
  }
  return bytes;
}

export function encodeInputBatch(events: InputEvent[]): Uint8Array<ArrayBuffer> {
  if (!Array.isArray(events)) throw new RelayError('invalid_input', 'Input must be an array');
  integer(events.length, 1, MAX_INPUT_BATCH, 'input batch length');
  const bytes = new Uint8Array(events.length * INPUT_SIZE);
  for (let index = 0; index < events.length; index++) bytes.set(encodeInputRecord(events[index]), index * INPUT_SIZE);
  return bytes;
}

export function batches(groups: InputEvent[][], limit = MAX_INPUT_BATCH): InputEvent[][] {
  integer(limit, 1, MAX_INPUT_BATCH, 'input batch limit');
  const result: InputEvent[][] = [];
  let batch: InputEvent[] = [];
  for (const group of groups) {
    if (group.length > limit) throw new RelayError('invalid_input', `An input group has more than ${limit} events`);
    if (batch.length + group.length > limit) {
      result.push(batch);
      batch = [];
    }
    batch.push(...group);
  }
  if (batch.length) result.push(batch);
  return result;
}

export function header(type: number, generation: number, sequence: number, size: number): Uint8Array<ArrayBuffer> {
  integer(type, 1, 6, 'message type');
  integer(generation, 1, 0xffffffff, 'generation');
  integer(sequence, 0, 0xffffffff, 'sequence');
  integer(size, 0, 8388620, 'payload length');
  const bytes = new Uint8Array(HEADER_SIZE + size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC);
  view.setUint8(4, VERSION);
  view.setUint8(5, type);
  view.setUint32(8, generation);
  view.setUint32(12, sequence);
  view.setUint32(16, size);
  return bytes;
}

export function encodeInput(event: InputEvent, generation: number, sequence: number): Uint8Array<ArrayBuffer> {
  const bytes = header(MESSAGE_TYPES.input, generation, sequence, INPUT_SIZE);
  bytes.set(encodeInputRecord(event), HEADER_SIZE);
  return bytes;
}

/** Builds an ACK carrying how long the frame waited inside the viewer, in microseconds, saturating at 2^32 - 1. Without a wait it is the 20-byte ACK that engines before the wait field require. */
export function encodeAck(generation: number, sequence: number, viewerWaitMs?: number): Uint8Array<ArrayBuffer> {
  if (viewerWaitMs === undefined) return header(MESSAGE_TYPES.ack, generation, sequence, 0);
  const bytes = header(MESSAGE_TYPES.ack, generation, sequence, 4);
  const micros = Number.isFinite(viewerWaitMs) ? Math.min(0xffffffff, Math.max(0, Math.round(viewerWaitMs * 1000))) : 0;
  new DataView(bytes.buffer).setUint32(HEADER_SIZE, micros);
  return bytes;
}

export interface Header { type: number; flags: number; generation: number; sequence: number; payloadLength: number }

export function parseHeader(bytes: Uint8Array | ArrayBuffer): Header {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength < HEADER_SIZE || data.byteLength > HEADER_SIZE + 12 + MAX_BYTES_IN_FLIGHT) throw new RelayError('protocol_error', 'Invalid message length');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const type = view.getUint8(5), flags = view.getUint16(6), generation = view.getUint32(8);
  if (view.getUint32(0) !== MAGIC || view.getUint8(4) !== VERSION || type < 1 || type > 6 ||
      flags > (type === MESSAGE_TYPES.frame ? 1 : 0) || !generation || view.getUint32(16) !== data.byteLength - HEADER_SIZE) {
    throw new RelayError('protocol_error', 'Invalid message envelope');
  }
  return { type, flags, generation, sequence: view.getUint32(12), payloadLength: view.getUint32(16) };
}

export type Message =
  | { type: 'frame'; generation: number; sequence: number; keyframe: boolean; width: number; height: number; timestamp: number; data: Uint8Array }
  | { type: 'cursor'; generation: number; width: number; height: number; hotX: number; hotY: number; pixels: Uint8ClampedArray }
  | { type: 'controlReady'; generation: number; width: number; height: number }
  | { type: 'inputResponse'; generation: number; sequence: number; status: number };

/** Validates and decodes one server message; throws a protocol_error RelayError for anything malformed or client-bound. */
export function parseMessage(bytes: Uint8Array | ArrayBuffer): Message {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const { type, flags, generation, sequence, payloadLength: size } = parseHeader(data);
  const view = new DataView(data.buffer, data.byteOffset + HEADER_SIZE, size);
  const invalid = (what: string) => new RelayError('protocol_error', `Invalid ${what}`);
  if (type === MESSAGE_TYPES.frame) {
    if (size < 13 || !sequence) throw invalid('frame header');
    const width = view.getUint16(0), height = view.getUint16(2), timestamp = view.getBigUint64(4);
    if (!width || !height || timestamp > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid('frame header');
    return { type: 'frame', generation, sequence, keyframe: flags === 1, width, height, timestamp: Number(timestamp), data: data.subarray(HEADER_SIZE + 12) };
  }
  if (type === MESSAGE_TYPES.cursor) {
    if (size < 8 || sequence) throw invalid('cursor envelope');
    const width = view.getUint16(0), height = view.getUint16(2), hotX = view.getUint16(4), hotY = view.getUint16(6);
    if (width > 256 || height > 256 || size !== 8 + width * height * 4 ||
        (width && height ? hotX >= width || hotY >= height : width || height || hotX || hotY)) throw invalid('cursor image');
    return { type: 'cursor', generation, width, height, hotX, hotY, pixels: new Uint8ClampedArray(data.buffer, data.byteOffset + HEADER_SIZE + 8, size - 8) };
  }
  if (type === MESSAGE_TYPES.controlReady) {
    if (size !== 4 || sequence || !view.getUint16(0) || !view.getUint16(2)) throw invalid('ready message');
    return { type: 'controlReady', generation, width: view.getUint16(0), height: view.getUint16(2) };
  }
  if (type === MESSAGE_TYPES.inputResponse) {
    if (size !== 1 || !sequence || view.getUint8(0) > 2) throw invalid('input response');
    return { type: 'inputResponse', generation, sequence, status: view.getUint8(0) };
  }
  throw invalid('message type');
}

/** Returns the `avc1.PPCCLL` codec string from the SPS in an H.264 Annex B keyframe. */
export function h264Codec(bytes: Uint8Array): string {
  for (let i = 0; i + 7 < bytes.length; i++) {
    let n = 0;
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) n = i + 3;
    else if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) n = i + 4;
    if (n && n + 3 < bytes.length && (bytes[n] & 31) === 7) {
      return `avc1.${[bytes[n + 1], bytes[n + 2], bytes[n + 3]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  throw new RelayError('protocol_error', 'Keyframe is missing SPS');
}

/** Returns the WebSocket URL and subprotocols for `/stream`, `/stream?view=1`, or `/control` on an engine origin. */
export function socketTarget(origin: URL, path: '/stream' | '/stream?view=1' | '/control', token?: string): { url: URL; protocols: string[] } {
  const url = new URL(path, origin);
  url.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  return { url, protocols: token ? [SUBPROTOCOL, `bearer.${token}`] : [SUBPROTOCOL] };
}

export const HID_KEYS: Record<string, number> = {};
function assignKeys(first: number, names: string[]): void {
  names.forEach((name, index) => { HID_KEYS[name] = first + index; });
}
assignKeys(4, Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`));
assignKeys(30, 'Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0'.split(' '));
assignKeys(40, 'Enter Escape Backspace Tab Space Minus Equal BracketLeft BracketRight Backslash'.split(' '));
assignKeys(51, 'Semicolon Quote Backquote Comma Period Slash CapsLock'.split(' '));
assignKeys(58, Array.from({ length: 12 }, (_, index) => `F${index + 1}`));
assignKeys(70, 'PrintScreen ScrollLock Pause Insert Home PageUp Delete End PageDown ArrowRight ArrowLeft ArrowDown ArrowUp NumLock'.split(' '));
assignKeys(84, 'NumpadDivide NumpadMultiply NumpadSubtract NumpadAdd NumpadEnter Numpad1 Numpad2 Numpad3 Numpad4 Numpad5 Numpad6 Numpad7 Numpad8 Numpad9 Numpad0 NumpadDecimal'.split(' '));
HID_KEYS.IntlBackslash = 100;
HID_KEYS.ContextMenu = 101;
assignKeys(104, Array.from({ length: 12 }, (_, index) => `F${index + 13}`));
assignKeys(224, 'ControlLeft ShiftLeft AltLeft MetaLeft ControlRight ShiftRight AltRight MetaRight'.split(' '));
Object.freeze(HID_KEYS);

export const MODIFIERS: Readonly<Record<string, number>> = Object.freeze({ ctrl: 224, control: 224, shift: 225, alt: 226, super: 227, meta: 227, cmd: 227, win: 227 });
export const NAMED_KEYS: Readonly<Record<string, number>> = Object.freeze({
  ...Object.fromEntries(Object.entries(HID_KEYS).filter(([name]) => !name.startsWith('Key') && !name.startsWith('Digit')).map(([name, code]) => [name.toLowerCase(), code])),
  return: 40, esc: 41, right: 79, left: 80, down: 81, up: 82, menu: 101,
});
const characters = "abcdefghijklmnopqrstuvwxyz1234567890";
const punctuation = "-=[]\\";
const punctuationTail = ";'`,./";
const shifted = '!@#$%^&*()_+{}|:"~<>?';
const unshifted = "1234567890-=[]\\;'`,./";

export function comboEvents(spec: string): InputEvent[] {
  if (typeof spec !== 'string' || !spec) throw new RelayError('invalid_input', 'Invalid key combo');
  const split = spec === '+' || spec.endsWith('++') ? spec.length - 2 : spec.lastIndexOf('+');
  if (split === 0 && spec !== '+') throw new RelayError('invalid_input', `Invalid key combo "${spec}"`);
  const held = split > 0 ? spec.slice(0, split).split('+') : [];
  const key = spec === '+' || spec.endsWith('++') ? '+' : spec.slice(split + 1);
  const modifiers: number[] = [];
  for (const name of held) {
    if (!Object.hasOwn(MODIFIERS, name.toLowerCase())) throw new RelayError('invalid_input', `Invalid key combo "${spec}"`);
    const code = MODIFIERS[name.toLowerCase()];
    if (!modifiers.includes(code)) modifiers.push(code);
  }
  const lower = key.toLowerCase();
  let code = Object.hasOwn(NAMED_KEYS, lower) ? NAMED_KEYS[lower] : Object.hasOwn(MODIFIERS, lower) ? MODIFIERS[lower] : undefined;
  if (code === undefined && key.length === 1) {
    const shiftedIndex = shifted.indexOf(key);
    const plain = shiftedIndex >= 0 ? unshifted[shiftedIndex] : lower;
    const index = characters.indexOf(plain);
    if (index >= 0) code = index + 4;
    else if (punctuation.includes(plain)) code = punctuation.indexOf(plain) + 45;
    else if (punctuationTail.includes(plain)) code = punctuationTail.indexOf(plain) + 51;
    else code = ({ '\n': 40, '\t': 43, ' ': 44 } as Record<string, number>)[plain];
    if ((shiftedIndex >= 0 || /[A-Z]/.test(key)) && !modifiers.includes(225)) modifiers.push(225);
  }
  if (code === undefined || !key) throw new RelayError('invalid_input', `Unknown key "${key}"`);
  const keys = [...modifiers.filter(modifier => modifier !== code), code];
  return [...keys.map(key => ({ type: 'keyDown' as const, key })), ...keys.reverse().map(key => ({ type: 'keyUp' as const, key }))];
}

export function textEvents(text: string): InputEvent[] {
  if (typeof text !== 'string') throw new RelayError('invalid_input', 'Text must be a string');
  return Array.from(text, character => {
    const codepoint = character.codePointAt(0)!;
    if (!codepoint || (codepoint >= 0xd800 && codepoint <= 0xdfff)) throw new RelayError('invalid_input', 'Invalid Unicode scalar');
    return { type: 'text', codepoint };
  });
}

export function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function validToken(token: unknown): token is string {
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token);
}

export function baseUrl(url: string, token?: string): URL {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new RelayError('invalid_input', 'Invalid server URL'); }
  const local = isLoopback(parsed.hostname);
  if (!['http:', 'https:'].includes(parsed.protocol) || (!local && parsed.protocol !== 'https:') ||
      parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new RelayError('invalid_input', 'Server URL must be an HTTPS origin or loopback HTTP origin');
  }
  if ((token !== undefined && !validToken(token)) || (!local && !token)) throw new RelayError('invalid_input', 'Remote connections require a 64-character hexadecimal token');
  return parsed;
}
