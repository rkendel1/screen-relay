import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, useConnectionState, useMutation, useQueryState, useSession } from "@feltdb/feltkit/react";
import { api } from "../feltkit/_generated/api";
import { DesktopStream } from "./DesktopStream";
import { ThemeToggle } from "./theme";

const time = (at?: number) => (at ? new Date(at).toLocaleTimeString() : "never");

function message(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "FORBIDDEN") return `Not allowed: ${e.message}`;
  return e?.message ?? String(error);
}

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
      {principal ? <Console /> : <main className="content"><p className="muted">Signing in…</p></main>}
    </div>
  );
}

function Console() {
  const overview = useQueryState(api.desktop.overview);
  const connect = useAction(api.desktop.connect);
  const disconnect = useMutation(api.desktop.disconnect);
  const [error, setError] = useState<string | null>(null);
  const run = (work: Promise<unknown>) => { setError(null); work.catch((e) => setError(message(e))); };

  if (overview.error) return <main className="content"><p className="error">{message(overview.error)}</p></main>;
  const data = overview.data;
  if (!data) return <main className="content"><p className="muted">Loading…</p></main>;
  const current = data.connections.find((c) => c.state === "connected") ?? null;
  const latest = data.connections[0] ?? null;

  return (
    <main className="content">
      <section className="card">
        <h2>Session</h2>
        <dl className="facts">
          <dt>Screen Relay host</dt><dd><code>{data.host}</code></dd>
          <dt>Status</dt><dd>{current ? <span className="ok">Connected ({current.backend}, {current.width}×{current.height})</span> : latest?.state === "failed" ? <span className="bad">Connection failed</span> : "Not connected"}</dd>
          <dt>Session</dt><dd><code>{current?.id ?? latest?.id ?? "none"}</code></dd>
          {latest?.state === "failed" && <><dt>Error</dt><dd className="bad">{latest.error}</dd></>}
        </dl>
        <div className="row">
          {current
            ? <button type="button" className="secondary" onClick={() => run(disconnect({ connectionId: current.id }))}>Disconnect</button>
            : <button type="button" disabled={connect.running} onClick={() => run(connect.run())}>{latest?.state === "failed" ? "Retry connection" : "Connect"}</button>}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {current && <Desktop connectionId={current.id} stream={data.stream} lastInteractionAt={current.lastInteractionAt} lastScreenshotAt={current.lastScreenshotAt} />}

      {latest && <Evidence connectionId={(current ?? latest).id} />}
    </main>
  );
}

function Desktop({ connectionId, stream, lastInteractionAt, lastScreenshotAt }: {
  connectionId: string;
  stream: { available: true; url: string } | { available: false; reason: string };
  lastInteractionAt?: number;
  lastScreenshotAt?: number;
}) {
  const click = useAction(api.desktop.click);
  const type = useAction(api.desktop.type);
  const key = useAction(api.desktop.key);
  const screenshot = useAction(api.desktop.screenshot);
  const fixture = useAction(api.desktop.runFixture);
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = click.running || type.running || key.running || screenshot.running || fixture.running;
  const run = (work: Promise<unknown>, done?: (value: any) => void) => {
    setError(null);
    work.then(done, (e) => setError(message(e)));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text) run(type.run({ connectionId, text }), () => setText(""));
  };

  return (
    <section className="card">
      <h2>Desktop</h2>
      {stream.available
        ? <DesktopStream url={stream.url} onPoint={(x, y) => run(click.run({ connectionId, x, y }))} />
        : <p className="muted">No stream: {stream.reason}</p>}
      <p className="muted">Click the picture to click the desktop. Last interaction: {time(lastInteractionAt)} · last screenshot: {time(lastScreenshotAt)}</p>
      <form className="row" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text to type on the desktop" aria-label="Text to type" />
        <button type="submit" disabled={busy || !text}>Type</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => run(key.run({ connectionId, combo: "Enter" }))}>Enter</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => run(screenshot.run({ connectionId, label: "manual" }))}>Screenshot</button>
        <button type="button" disabled={busy} onClick={() => run(fixture.run({ connectionId }), (r) => setResult(r.passed ? `Fixture passed: ${r.initial} → ${r.final}` : `Fixture failed: ${r.initial} → ${r.final}`))}>
          {fixture.running ? "Running fixture check…" : "Run fixture check"}
        </button>
      </form>
      {result && <p className={result.startsWith("Fixture passed") ? "ok" : "bad"} role="status">{result}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Evidence({ connectionId }: { connectionId: string }) {
  const history = useQueryState(api.desktop.history, { connectionId });
  const shots = useQueryState(api.desktop.screenshotList, { connectionId });
  return (
    <section className="card">
      <h2>Evidence <span className="muted">· session <code>{connectionId}</code></span></h2>
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
            <span className="detail">{Object.keys(event.data ?? {}).length ? JSON.stringify(event.data) : ""}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
