import { detectAgent } from './agent.js';

export interface OutputOptions { json?: boolean; 'no-color'?: boolean; color?: boolean }

const override = process.env.SCREEN_RELAY_AGENT;

export const agent = override === '1' ? true : override === '0' ? false : detectAgent();

export function outputMode(args: OutputOptions = {}, stream: NodeJS.WriteStream = process.stderr) {
  const plain = !stream.isTTY || process.env.TERM === 'dumb';
  const forced = process.env.FORCE_COLOR;
  const color = args['no-color'] || args.color === false || process.env.NO_COLOR
    ? false : forced !== undefined ? forced !== '0' : !plain;
  return { tty: Boolean(stream.isTTY), plain, color: color && !plain && !args.json, pretty: Boolean(process.stdout.isTTY) };
}

/** Whether the CLI may prompt: a person at a terminal, not an agent, CI, or a JSON caller. */
export function interactive(args: OutputOptions = {}): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY) && !args.json && !agent && !process.env.CI && process.env.TERM !== 'dumb';
}
