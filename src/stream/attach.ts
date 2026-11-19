import { SUBPROTOCOL, encodeAck, h264Codec, parseMessage } from '../protocol/index.js';

/** Where to open a stream: a WebSocket URL and the subprotocols to offer (`nsl1` is always offered). */
export interface StreamTarget {
  url: string;
  protocols?: string[];
}

export type StreamStatus =
  | { state: 'connecting' }
  | { state: 'live'; width: number; height: number }
  | { state: 'closed'; reason: string };

/** A stream drawing into a canvas. `close()` ends it; it does not reconnect on its own. */
export interface AttachedStream {
  close(): void;
  readonly status: StreamStatus;
}

/** The subprotocol that carries an access grant's secret to a server that redeems it. */
export function grantProtocol(token: string): string {
  return `appport-grant.${token}`;
}

/**
 * Draws a Screen Relay stream (NSL1 over WebSocket, H.264 decoded with WebCodecs) into a canvas, and acknowledges each
 * frame after drawing it, as the protocol's flow control requires. Needs a browser with `VideoDecoder`.
 */
export function attachStream(canvas: HTMLCanvasElement, target: StreamTarget, onStatus: (status: StreamStatus) => void = () => {}): AttachedStream {
  let status: StreamStatus = { state: 'connecting' };
  const report = (next: StreamStatus) => {
    status = next;
    onStatus(next);
  };
  report(status);
  if (typeof VideoDecoder === 'undefined') {
    report({ state: 'closed', reason: 'This browser has no WebCodecs H.264 decoder.' });
    return { close() {}, get status() { return status; } };
  }
  let stopped = false;
  let decoder: VideoDecoder | null = null;
  let generation = 0;
  const pending = new Map<number, { generation: number; sequence: number; arrived: number }>();
  const socket = new WebSocket(target.url, [SUBPROTOCOL, ...(target.protocols ?? []).filter((p) => p !== SUBPROTOCOL)]);
  socket.binaryType = 'arraybuffer';
  const stop = (reason: string) => {
    if (stopped) return;
    stopped = true;
    if (decoder && decoder.state !== 'closed') decoder.close();
    if (socket.readyState <= WebSocket.OPEN) socket.close();
    report({ state: 'closed', reason });
  };
  socket.onmessage = (event) => {
    try {
      const message = parseMessage(event.data as ArrayBuffer);
      if (message.type !== 'frame') return;
      if (message.generation !== generation) {
        if (decoder && decoder.state !== 'closed') decoder.close();
        decoder = null;
        pending.clear();
        generation = message.generation;
      }
      pending.set(message.timestamp, { generation: message.generation, sequence: message.sequence, arrived: performance.now() });
      if (!decoder) {
        canvas.width = message.width;
        canvas.height = message.height;
        const draw = canvas.getContext('2d');
        if (!draw) throw new Error('The canvas has no 2D context');
        let drawn = 0;
        decoder = new VideoDecoder({
          output(frame) {
            const item = pending.get(frame.timestamp);
            pending.delete(frame.timestamp);
            draw.drawImage(frame, 0, 0);
            frame.close();
            if (item && socket.readyState === WebSocket.OPEN) socket.send(encodeAck(item.generation, item.sequence, performance.now() - item.arrived));
            if (++drawn === 1) report({ state: 'live', width: canvas.width, height: canvas.height });
          },
          error: (error) => stop(`Decoding failed: ${error.message}`),
        });
        decoder.configure({ codec: h264Codec(message.data), codedWidth: message.width, codedHeight: message.height, optimizeForLatency: true });
      }
      decoder.decode(new EncodedVideoChunk({ type: message.keyframe ? 'key' : 'delta', timestamp: message.timestamp, data: message.data }));
    } catch (error) {
      stop(`Stream error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  socket.onclose = (event) => stop(event.reason ? `Stream closed: ${event.reason}` : `Stream closed (code ${event.code})`);
  return {
    close: () => stop('Closed'),
    get status() { return status; },
  };
}
