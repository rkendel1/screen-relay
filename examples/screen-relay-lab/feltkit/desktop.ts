/**
 * Desktop operations. Actions talk to Screen Relay (through _relay.ts) and record what happened through mutations;
 * mutations and queries own the durable state: connections, screenshots, and the per-connection event history.
 */
import { fail, s, type ActionCtx, type MutationCtx } from "@feltdb/feltkit";
import { app, connections, events, screenshots } from "./app.js";
import { api } from "./_generated/api.js";
import * as relay from "./_relay.js";
import { FIXTURE, fixtureState, pngSize } from "./_fixture.js";

const now = () => Date.now();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const Fraction = s.number({ minimum: 0, maximum: 1 });

// ---- Reads ----

/** The configured engine, whether the browser may read its stream, and the most recent connections. */
export const overview = app.query({
  access: "desktop.read",
  handler: async (ctx) => {
    const recent = await ctx.db.find(connections, {}, { orderBy: [{ field: "openedAt", direction: "desc" }], limit: 10 });
    return { host: relay.host(), stream: relay.stream(), connections: recent };
  },
});

/** One connection's events, oldest first. */
export const history = app.query({
  access: "desktop.read",
  args: { connectionId: s.string() },
  handler: (ctx, { connectionId }) => events.history(ctx, "connection", connectionId),
});

/** One connection's screenshots, newest first, each with a short-lived link to the stored image. */
export const screenshotList = app.query({
  access: "desktop.read",
  args: { connectionId: s.string() },
  handler: async (ctx, { connectionId }) => {
    const rows = await ctx.db.find(screenshots, { connectionId }, { orderBy: [{ field: "capturedAt", direction: "desc" }], limit: 20 });
    return Promise.all(rows.map(async (row) => ({
      ...row,
      url: (await ctx.services.files.link(row.fileId, { disposition: "inline", cache: true, expiresInSeconds: 3600 })).url,
    })));
  },
});

/** Fails unless the connection is open. Actions call it before they reach Screen Relay. */
export const requireOpen = app.query({
  access: "desktop.control",
  args: { connectionId: s.string() },
  handler: async (ctx, { connectionId }): Promise<void> => {
    const connection = await ctx.db.get(connections, connectionId);
    if (!connection) fail("NOT_FOUND", `No connection ${connectionId}`);
    if (connection.state !== "connected") fail("FAILED_PRECONDITION", "That connection is not open. Connect again.");
  },
});

// ---- Records written by the actions below (operators only) ----

async function connected(ctx: MutationCtx, id: string) {
  const connection = await ctx.db.get(connections, id);
  if (!connection) fail("NOT_FOUND", `No connection ${id}`);
  if (connection.state !== "connected") fail("FAILED_PRECONDITION", "That connection is not open. Connect again.");
  return connection;
}

export const recordConnected = app.mutation({
  access: "desktop.connect",
  args: { host: s.string(), backend: s.string(), width: s.number(), height: s.number() },
  handler: async (ctx, args) => {
    const by = ctx.auth.requirePrincipal().id;
    const open = await ctx.db.find(connections, { state: "connected" });
    for (const previous of open) {
      await ctx.db.patch(connections, previous.id, { state: "disconnected", closedAt: now(), closedBy: by });
      await events.record(ctx, { subject: "connection", id: previous.id, type: "session.disconnected", data: { reason: "replaced by a new connection" } });
    }
    const id = await ctx.db.insert(connections, { ...args, state: "connected", openedAt: now(), openedBy: by });
    await events.record(ctx, { subject: "connection", id, type: "session.connected", data: { host: args.host, backend: args.backend, width: args.width, height: args.height } });
    return id;
  },
});

export const recordConnectFailure = app.mutation({
  access: "desktop.connect",
  args: { host: s.string(), error: s.string({ maxLength: 500 }) },
  handler: async (ctx, { host, error }) => {
    const at = now();
    const id = await ctx.db.insert(connections, { host, state: "failed", error, openedAt: at, openedBy: ctx.auth.requirePrincipal().id, closedAt: at });
    await events.record(ctx, { subject: "connection", id, type: "session.failed", data: { host, error } });
    return id;
  },
});

/** Ends a connection. The engine keeps running; the browser closes its stream when the state changes. */
export const disconnect = app.mutation({
  access: "desktop.connect",
  args: { connectionId: s.string() },
  handler: async (ctx, { connectionId }) => {
    await connected(ctx, connectionId);
    await ctx.db.patch(connections, connectionId, { state: "disconnected", closedAt: now(), closedBy: ctx.auth.requirePrincipal().id });
    await events.record(ctx, { subject: "connection", id: connectionId, type: "session.disconnected", data: { reason: "requested" } });
  },
});

export const recordInput = app.mutation({
  access: "desktop.control",
  args: { connectionId: s.string(), kind: s.enum(["click", "type", "key"]), detail: s.record(s.unknown()), ok: s.boolean(), error: s.optional(s.string({ maxLength: 500 })) },
  handler: async (ctx, { connectionId, kind, detail, ok, error }) => {
    await connected(ctx, connectionId);
    if (ok) await ctx.db.patch(connections, connectionId, { lastInteractionAt: now() });
    await events.record(ctx, { subject: "connection", id: connectionId, type: ok ? `input.${kind}` : `input.${kind}.failed`, data: { ...detail, ...(error ? { error } : {}) } });
  },
});

export const recordScreenshot = app.mutation({
  access: "desktop.control",
  args: { connectionId: s.string(), label: s.string({ minLength: 1, maxLength: 80 }), png: s.string() },
  handler: async (ctx, { connectionId, label, png }) => {
    await connected(ctx, connectionId);
    const bytes = new Uint8Array(Buffer.from(png, "base64"));
    const { width, height } = pngSize(bytes);
    const by = ctx.auth.requirePrincipal().id;
    const file = await ctx.services.files.upload({ name: `${connectionId}-${label}.png`, contentType: "image/png", content: bytes, metadata: { kind: "screenshot", connectionId } });
    const at = now();
    const id = await ctx.db.insert(screenshots, { connectionId, fileId: file.id, label, width, height, bytes: file.size, ...(file.checksum ? { checksum: file.checksum } : {}), capturedAt: at, capturedBy: by });
    await ctx.db.patch(connections, connectionId, { lastScreenshotAt: at });
    await events.record(ctx, { subject: "connection", id: connectionId, type: "screenshot.captured", data: { screenshotId: id, label, width, height, bytes: file.size, checksum: file.checksum ?? null } });
    return id;
  },
});

export const recordFixtureResult = app.mutation({
  access: "desktop.control",
  args: { connectionId: s.string(), passed: s.boolean(), before: s.string(), after: s.string(), detail: s.record(s.unknown()) },
  handler: async (ctx, { connectionId, passed, before, after, detail }) => {
    await connected(ctx, connectionId);
    await events.record(ctx, { subject: "connection", id: connectionId, type: passed ? "fixture.passed" : "fixture.failed", data: { before, after, ...detail } });
  },
});

// ---- Actions: the only functions that reach Screen Relay ----

/** Checks the engine and opens a connection record. */
export const connect = app.action({
  access: "desktop.connect",
  handler: async (ctx): Promise<string> => {
    const host = relay.host();
    try {
      const capabilities = await relay.describe();
      return await ctx.runMutation(api.desktop.recordConnected, { host, backend: capabilities.backend, width: capabilities.width, height: capabilities.height });
    } catch (error) {
      await ctx.runMutation(api.desktop.recordConnectFailure, { host, error: relay.messageOf(error).slice(0, 500) });
      throw error;
    }
  },
});

async function input(ctx: ActionCtx, connectionId: string, kind: "click" | "type" | "key", detail: Record<string, unknown>, run: () => Promise<unknown>): Promise<void> {
  await ctx.runQuery(api.desktop.requireOpen, { connectionId });
  try {
    await run();
  } catch (error) {
    await ctx.runMutation(api.desktop.recordInput, { connectionId, kind, detail, ok: false, error: relay.messageOf(error).slice(0, 500) });
    throw error;
  }
  await ctx.runMutation(api.desktop.recordInput, { connectionId, kind, detail, ok: true });
}

/** Clicks at a point given as fractions of the screen (0 to 1). */
export const click = app.action({
  access: "desktop.control",
  args: { connectionId: s.string(), x: Fraction, y: Fraction },
  handler: (ctx, { connectionId, x, y }) => input(ctx, connectionId, "click", { x, y }, () => relay.click(x, y)),
});

/** Types text into the focused window. */
export const type = app.action({
  access: "desktop.control",
  args: { connectionId: s.string(), text: s.string({ minLength: 1, maxLength: 500 }) },
  handler: (ctx, { connectionId, text }) => input(ctx, connectionId, "type", { characters: [...text].length }, () => relay.type(text)),
});

/** Presses one key combo, such as "Enter" or "Control+A". */
export const key = app.action({
  access: "desktop.control",
  args: { connectionId: s.string(), combo: s.string({ minLength: 1, maxLength: 40 }) },
  handler: (ctx, { connectionId, combo }) => input(ctx, connectionId, "key", { combo }, () => relay.key(combo)),
});

async function capture(ctx: ActionCtx, connectionId: string, label: string): Promise<{ id: string; png: Uint8Array }> {
  await ctx.runQuery(api.desktop.requireOpen, { connectionId });
  const png = await relay.screenshot();
  const id = await ctx.runMutation(api.desktop.recordScreenshot, { connectionId, label, png: Buffer.from(png).toString("base64") });
  return { id, png };
}

/** Captures the screen and keeps it as evidence. */
export const screenshot = app.action({
  access: "desktop.control",
  args: { connectionId: s.string(), label: s.optional(s.string({ minLength: 1, maxLength: 80 })) },
  handler: async (ctx, { connectionId, label }): Promise<string> => (await capture(ctx, connectionId, label ?? "manual")).id,
});

type FixtureRun = { passed: boolean; initial: string; final: string; before: string; after: string };

/**
 * The deterministic check against fixture/index.html, which must be open full screen on the desktop:
 * reload it, capture it, type the expected value, submit, capture again, and read the result from the banner color.
 */
export const runFixture = app.action({
  access: "desktop.control",
  args: { connectionId: s.string() },
  handler: async (ctx, { connectionId }): Promise<FixtureRun> => {
    await input(ctx, connectionId, "key", { combo: "F5", step: "reload fixture" }, () => relay.key("F5"));
    await sleep(1500);
    const before = await capture(ctx, connectionId, "fixture-before");
    const initial = fixtureState(before.png);
    await input(ctx, connectionId, "click", { ...FIXTURE.input, step: "focus input" }, () => relay.click(FIXTURE.input.x, FIXTURE.input.y));
    await input(ctx, connectionId, "type", { characters: FIXTURE.value.length, step: "enter value" }, () => relay.type(FIXTURE.value));
    await input(ctx, connectionId, "click", { ...FIXTURE.button, step: "submit" }, () => relay.click(FIXTURE.button.x, FIXTURE.button.y));
    await sleep(800);
    const after = await capture(ctx, connectionId, "fixture-after");
    const final = fixtureState(after.png);
    const passed = initial.state === "ready" && final.state === "success";
    await ctx.runMutation(api.desktop.recordFixtureResult, {
      connectionId, passed, before: before.id, after: after.id,
      detail: { initial: initial.state, initialRgb: initial.rgb, final: final.state, finalRgb: final.rgb, expected: "ready → success" },
    });
    return { passed, initial: initial.state, final: final.state, before: before.id, after: after.id };
  },
});
