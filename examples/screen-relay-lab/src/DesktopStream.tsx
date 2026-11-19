import { useEffect, useRef, useState, type MouseEvent } from "react";
import { SUBPROTOCOL, encodeAck, h264Codec, parseMessage } from "@appport/screen-relay/protocol";

type Status = { tone: "wait" | "live" | "error"; text: string };

/**
 * The desktop's view-only stream, read straight from the Screen Relay engine over its binary WebSocket protocol
 * (`/stream?view=1`, H.264 decoded with WebCodecs). Each frame is acknowledged after it is drawn, as the protocol's
 * flow control requires. A click on the picture reports where, as fractions of the screen; it sends nothing itself.
 */
export function DesktopStream({ url, onPoint }: { url: string; onPoint?: (x: number, y: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>({ tone: "wait", text: "Connecting to the stream…" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!("VideoDecoder" in window)) {
      setStatus({ tone: "error", text: "This browser has no WebCodecs H.264 decoder." });
      return;
    }
    let stopped = false;
    let decoder: VideoDecoder | null = null;
    let generation = 0;
    let frames = 0;
    const pending = new Map<number, { generation: number; sequence: number; arrived: number }>();
    const socket = new WebSocket(url, [SUBPROTOCOL]);
    socket.binaryType = "arraybuffer";
    const stop = (text: string) => {
      if (stopped) return;
      stopped = true;
      setStatus({ tone: "error", text });
      decoder?.close();
      if (socket.readyState <= WebSocket.OPEN) socket.close();
    };
    socket.onmessage = (event) => {
      try {
        const message = parseMessage(event.data as ArrayBuffer);
        if (message.type !== "frame") return;
        if (message.generation !== generation) {
          decoder?.close();
          decoder = null;
          pending.clear();
          generation = message.generation;
        }
        pending.set(message.timestamp, { generation: message.generation, sequence: message.sequence, arrived: performance.now() });
        if (!decoder) {
          const target = canvas.current!;
          target.width = message.width;
          target.height = message.height;
          const draw = target.getContext("2d")!;
          decoder = new VideoDecoder({
            output(frame) {
              const item = pending.get(frame.timestamp);
              pending.delete(frame.timestamp);
              draw.drawImage(frame, 0, 0);
              frame.close();
              if (item && socket.readyState === WebSocket.OPEN) socket.send(encodeAck(item.generation, item.sequence, performance.now() - item.arrived) as Uint8Array<ArrayBuffer>);
              if (++frames === 1) setStatus({ tone: "live", text: `Live · ${target.width}×${target.height}` });
            },
            error: (error) => stop(`Decoding failed: ${error.message}`),
          });
          decoder.configure({ codec: h264Codec(message.data), codedWidth: message.width, codedHeight: message.height, optimizeForLatency: true });
        }
        decoder.decode(new EncodedVideoChunk({ type: message.keyframe ? "key" : "delta", timestamp: message.timestamp, data: message.data }));
      } catch (error) {
        stop(`Stream error: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    socket.onclose = (event) => stop(`Stream closed${event.reason ? `: ${event.reason}` : ` (code ${event.code})`}`);
    return () => {
      stopped = true;
      decoder?.close();
      socket.close();
    };
  }, [url, attempt]);

  const point = (event: MouseEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (value: number) => Math.min(1, Math.max(0, value));
    onPoint?.(fraction((event.clientX - box.left) / box.width), fraction((event.clientY - box.top) / box.height));
  };

  return (
    <div className="stream">
      <canvas ref={canvas} className={onPoint ? "clickable" : undefined} onClick={point} aria-label="Remote desktop" />
      <div className={`stream-status ${status.tone}`} role="status">
        {status.text}
        {status.tone === "error" && (
          <button type="button" className="secondary" onClick={() => { setStatus({ tone: "wait", text: "Reconnecting…" }); setAttempt((n) => n + 1); }}>
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}
