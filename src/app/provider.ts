import { AppPortError } from '@appport/protocol';
import { s } from '@appport/schema';
import { defineProvider, effectFailed, providerCapability, type ProviderCallContext } from '@appport/core';
import { createClient, RelayError, type Capabilities, type Client } from '../sdk/index.js';

/** The provider's state: one SDK client for the configured engine. */
export interface DesktopRuntime {
  readonly url: string;
  readonly client: Client;
}

type Context = ProviderCallContext<DesktopRuntime>;

const Config = s.object({
  url: s.optional(s.string({ minLength: 1 })),
  timeoutMs: s.optional(s.integer({ minimum: 1, maximum: 120_000 })),
});

const Fraction = s.number({ minimum: 0, maximum: 1 });
const InputResult = s.object({ events: s.integer({ minimum: 0 }) });

const CODES: Partial<Record<string, ConstructorParameters<typeof AppPortError>[0]>> = {
  invalid_input: 'INVALID_INPUT',
  unsupported_input: 'INVALID_INPUT',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  busy: 'CONFLICT',
  timeout: 'TIMEOUT',
  not_found: 'NOT_FOUND',
};

const NOT_APPLIED = new Set(['unreachable', 'invalid_input', 'unsupported_input', 'unauthorized', 'forbidden']);

/** An SDK failure as an AppPort error, keeping the engine's reason. */
function refusal(error: RelayError): AppPortError {
  return new AppPortError(CODES[error.reason] ?? 'desktop.UNAVAILABLE', `Screen Relay ${error.reason}: ${error.message}`, { details: { reason: error.reason } });
}

/** Runs an observation; nothing on the desktop changes. */
async function observe<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw error instanceof RelayError ? refusal(error) : error;
  }
}

/** Runs input on the desktop as an external effect: recorded before it is sent, and failed only when the engine applied none of it. */
async function apply(context: Context, detail: Record<string, string | number>, run: () => Promise<{ events: number }>) {
  await context.effect.begin(detail);
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof RelayError)) throw error;
    const applied = (error as RelayError & { applied?: number }).applied ?? (typeof error.data?.applied === 'number' ? error.data.applied : undefined);
    if (NOT_APPLIED.has(error.reason) || (error.reason === 'busy' && applied === 0)) {
      const known = refusal(error);
      throw effectFailed(known.code, known.message, { reason: error.reason });
    }
    throw new Error(`Screen Relay ${error.reason}: ${error.message}`);
  }
}

/** Screen Relay as an AppPort provider: a running engine's display, screenshots, and input, under the host's authority. */
export const screenRelayProvider = defineProvider<{ url?: string; timeoutMs?: number }, DesktopRuntime>({
  id: 'screen-relay',
  version: '0.1.2',
  description: 'Observe and operate a desktop through a running Screen Relay engine.',
  configuration: Config,
  credentials: [{ id: 'engine-token', description: 'The engine session token, for an engine that is not on loopback.', required: false }],
  async start({ config, credential }) {
    const url = new URL(config.url ?? 'http://127.0.0.1:8080').origin;
    const token = (await credential('engine-token')) ?? undefined;
    const client = createClient({ url, ...(token ? { token } : {}), timeout: config.timeoutMs ?? 15_000 });
    return {
      runtime: { url, client },
      async health() {
        try {
          await client.capabilities();
          return { state: 'ready' as const };
        } catch (error) {
          return { state: 'degraded' as const, detail: error instanceof Error ? error.message : String(error) };
        }
      },
    };
  },
  capabilities: [
    providerCapability<DesktopRuntime, Record<string, never>, { backend: string; width: number; height: number; fps: number; keyboard: boolean; pointer: boolean }>({
      name: 'desktop.display.describe',
      version: 1,
      description: 'The desktop the engine serves: backend, size, frame rate, and which input it accepts.',
      input: s.object({}),
      output: s.object({ backend: s.string(), width: s.integer(), height: s.integer(), fps: s.integer(), keyboard: s.boolean(), pointer: s.boolean() }),
      authorization: ['desktop.view'],
      handler: (_input, context) => observe(async () => {
        const capabilities: Capabilities = await context.provider.runtime.client.capabilities();
        return { backend: capabilities.backend, width: capabilities.width, height: capabilities.height, fps: capabilities.fps, keyboard: capabilities.input.keyboard, pointer: capabilities.input.pointer };
      }),
    }),
    providerCapability<DesktopRuntime, Record<string, never>, { contentType: 'image/png'; width: number; height: number; data: string }>({
      name: 'desktop.screenshot.capture',
      version: 1,
      description: 'A PNG of the whole desktop, base64-encoded.',
      input: s.object({}),
      output: s.object({ contentType: s.literal('image/png'), width: s.integer(), height: s.integer(), data: s.string() }),
      authorization: ['desktop.view'],
      timeoutMs: 30_000,
      handler: (_input, context) => observe(async () => {
        const png = await context.provider.runtime.client.screenshot();
        const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
        return { contentType: 'image/png' as const, width: view.getUint32(16), height: view.getUint32(20), data: Buffer.from(png).toString('base64') };
      }),
    }),
    providerCapability<DesktopRuntime, { action: 'click' | 'move'; x: number; y: number; button?: 'left' | 'middle' | 'right' }, { events: number }>({
      name: 'desktop.input.pointer',
      version: 1,
      description: 'Moves the pointer or clicks at a point given as fractions of the screen (0 to 1).',
      effect: 'consequential',
      input: s.object({ action: s.enum(['click', 'move']), x: Fraction, y: Fraction, button: s.optional(s.enum(['left', 'middle', 'right'])) }),
      output: InputResult,
      authorization: ['desktop.control'],
      concurrency: { mode: 'serialized' },
      handler: (input, context) => apply(context, { action: input.action, x: input.x, y: input.y }, () =>
        input.action === 'click'
          ? context.provider.runtime.client.click(input.x, input.y, { button: input.button ?? 'left' })
          : context.provider.runtime.client.move(input.x, input.y)),
    }),
    providerCapability<DesktopRuntime, { text?: string; keys?: string[] }, { events: number }>({
      name: 'desktop.input.keyboard',
      version: 1,
      description: 'Types text into the focused window, or presses key combos such as "Enter" or "Control+A". Give one of text or keys.',
      effect: 'consequential',
      input: s.object({ text: s.optional(s.string({ minLength: 1, maxLength: 2000 })), keys: s.optional(s.array(s.string({ minLength: 1, maxLength: 40 }))) }),
      output: InputResult,
      authorization: ['desktop.control'],
      concurrency: { mode: 'serialized' },
      handler: (input, context) => {
        if ((input.text === undefined) === (input.keys === undefined || input.keys.length === 0)) {
          throw new AppPortError('INVALID_INPUT', 'Give exactly one of text or keys.');
        }
        return input.text !== undefined
          ? apply(context, { kind: 'text', characters: [...input.text].length }, () => context.provider.runtime.client.type(input.text!))
          : apply(context, { kind: 'keys', keys: input.keys!.join(' ') }, () => context.provider.runtime.client.key(...input.keys!));
      },
    }),
  ],
});

export default screenRelayProvider;
