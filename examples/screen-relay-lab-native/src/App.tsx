import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, useConnectionState, useFeltKit, useQueryState, useSession } from "@feltdb/feltkit/react";
import { attachStream, grantProtocol, type StreamStatus } from "@appport/screen-relay/viewer";
import { api } from "../feltkit/_generated/api";
import { ThemeToggle } from "./theme";

type Display = { backend: string; width: number; height: number; fps: number };
type Opened = { channel: { url: string }; grant: { token: string } };
const time = (at?: number) => (at ? new Date(at).toLocaleTimeString() : "never");
const message = (error: unknown) => (error as { message?: string } | null)?.message ?? String(error);

export function App() {
  const { session, signInAsDevUser } = useSession();
  const online = useConnectionState();
  const principal = session?.principal ?? null;
  const tried = useRef(false);
  useEffect(() => {
    if (session && !principal && session.devUsers.length && !tried.current) {
      tried.current = true;
      void signInAsDevUser(session.devUsers[0]!.id);
    }
  }, [session, principal, signInAsDevUser]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img className="mark" src="/feltkit-mark.png" alt="" />
          Screen Relay Lab
          <span className={online ? "env" : "env env-prod"}>{online ? "app online" : "app offline"}</span>
        </div>
        <div className="row">
          {session?.devUsers.length ? (
            <select aria-label="Signed in as" value={principal?.id ?? ""} onChange={(e) => void signInAsDevUser(e.target.value)}>
              {session.devUsers.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.id} ({user.roles.join(", ")})</option>)}
            </select>
          ) : null}
          <ThemeToggle />
        </div>
      </header>
      {principal ? <Console key={principal.id} /> : <main className="content"><p className="muted">Signing in…</p></main>}
    </div>
  );
}

function Console() {
  const client = useFeltKit();
  const [display, setDisplay] = useState<Display | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [lastInput, setLastInput] = useState<number>();
  const describe = useCallback(() => {
    setError(null);
    client.invoke<Display>("desktop.display.describe").then(setDisplay, (e) => { setDisplay(null); setError(message(e)); });
  }, [client]);
  useEffect(describe, [describe]);
  const operate = (capability: string, input: Record<string, unknown>) => {
    setError(null);
    client.invoke(capability, input).then(() => setLastInput(Date.now()), (e) => setError(message(e)));
  };

  return (
    <main className="content">
      <section className="card">
        <h2>Session</h2>
        <dl className="facts">
          <dt>Provider</dt><dd><code>desktop</code> (Screen Relay)</dd>
          <dt>Desktop</dt><dd>{display ? <span className="ok">{display.backend}, {display.width}×{display.height} at {display.fps} fps</span> : error ? <span className="bad">Unavailable</span> : "Checking…"}</dd>
        </dl>
        <div className="row">
          <button type="button" className="secondary" onClick={describe}>Check again</button>
          {display && <button type="button" onClick={() => setStreaming((s) => !s)}>{streaming ? "Stop stream" : "Start stream"}</button>}
        </div>
        {error && <p className="error">{error}</p>}
      </section>
      {display && (
        <Desktop streaming={streaming} lastInput={lastInput} operate={operate} />
      )}
      <Evidence />
    </main>
  );
}

function Desktop({ streaming, lastInput, operate }: { streaming: boolean; lastInput?: number; operate: (capability: string, input: Record<string, unknown>) => void }) {
  const client = useFeltKit();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<StreamStatus>({ state: "closed", reason: "Stream stopped" });
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const screenshot = useAction(api.lab.screenshot);
  const fixture = useAction(api.lab.runFixture);

  useEffect(() => {
    if (!streaming || !canvas.current) return;
    let stream: { close(): void } | null = null;
    let cancelled = false;
    setStatus({ state: "connecting" });
    client.invoke<Opened>("desktop.stream.view").then((opened) => {
      if (cancelled) return;
      const url = new URL(opened.channel.url, location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      stream = attachStream(canvas.current!, { url: url.href, protocols: [grantProtocol(opened.grant.token)] }, setStatus);
    }, (e) => setStatus({ state: "closed", reason: message(e) }));
    return () => { cancelled = true; stream?.close(); };
  }, [client, streaming, attempt]);

  const click = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    operate("desktop.input.pointer", { action: "click", x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text) { operate("desktop.input.keyboard", { text }); setText(""); }
  };
  const busy = screenshot.running || fixture.running;

  return (
    <section className="card">
      <h2>Desktop</h2>
      <div className="stream">
        <canvas ref={canvas} className="clickable" onClick={click} aria-label="Remote desktop" />
        <div className={`stream-status ${status.state === "live" ? "live" : status.state === "closed" ? "error" : "wait"}`} role="status">
          {status.state === "live" ? `Live · ${status.width}×${status.height}` : status.state === "connecting" ? "Connecting…" : status.reason}
          {streaming && status.state === "closed" && <button type="button" className="secondary" onClick={() => setAttempt((n) => n + 1)}>Reconnect</button>}
        </div>
      </div>
      <p className="muted">Click the picture to click the desktop. Last input: {time(lastInput)}</p>
      <form className="row" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text to type on the desktop" aria-label="Text to type" />
        <button type="submit" disabled={!text}>Type</button>
        <button type="button" className="secondary" onClick={() => operate("desktop.input.keyboard", { keys: ["Enter"] })}>Enter</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => screenshot.run({ label: "manual" }).catch((e) => setError(message(e)))}>Screenshot</button>
        <button type="button" disabled={busy} onClick={() => fixture.run().then((r) => setResult(`Fixture ${r.passed ? "passed" : "failed"}: ${r.initial} → ${r.final}`), (e) => setError(message(e)))}>
          {fixture.running ? "Running fixture check…" : "Run fixture check"}
        </button>
      </form>
      {result && <p className={result.includes("passed") ? "ok" : "bad"} role="status">{result}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Evidence() {
  const shots = useQueryState(api.lab.screenshotList);
  const history = useQueryState(api.lab.history);
  return (
    <section className="card">
      <h2>Evidence</h2>
      {shots.data?.length ? (
        <div className="shots">
          {shots.data.map((shot) => (
            <figure key={shot.id}>
              <a href={shot.url} target="_blank" rel="noreferrer"><img src={shot.url} alt={`Screenshot ${shot.label}`} /></a>
              <figcaption>{shot.label} · {time(shot.capturedAt)} · {Math.round(shot.bytes / 1024)} KB</figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="muted">No screenshots yet.</p>}
      <ol className="history">
        {(history.data ?? []).map((event) => (
          <li key={event.id} className={event.type.endsWith("failed") ? "bad" : undefined}>
            <span className="when">{time(event.at)}</span>
            <code>{event.type}</code>
            <span className="muted">{event.actor}</span>
            <span className="detail">{JSON.stringify(event.data ?? {})}</span>
          </li>
        ))}
      </ol>
      <p className="muted">Every desktop input is also recorded by FeltKit before it is sent, with its outcome (Studio → Data → _feltkit_provider_calls).</p>
    </section>
  );
}
