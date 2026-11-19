/**
 * The application's own logic: which screenshots it keeps, and the deterministic fixture check. Desktop operations
 * are the Screen Relay provider's capabilities (desktop.*), which FeltKit authorizes and records; this module only
 * decides what to do with them.
 */
import { s, type ActionCtx } from "@feltdb/feltkit";
import { app, runs, screenshots } from "./app.js";
import { api } from "./_generated/api.js";
import { FIXTURE, fixtureState } from "./_fixture.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Shot = { contentType: "image/png"; width: number; height: number; data: string };

/** The kept screenshots, newest first, each with a short-lived link. */
export const screenshotList = app.query({
  access: "lab.read",
  handler: async (ctx) => {
    const rows = await ctx.db.find(screenshots, {}, { orderBy: [{ field: "capturedAt", direction: "desc" }], limit: 20 });
    return Promise.all(rows.map(async (row) => ({ ...row, url: (await ctx.services.files.link(row.fileId, { disposition: "inline", cache: true, expiresInSeconds: 3600 })).url })));
  },
});

/** Every fixture run, oldest first. */
export const history = app.query({
  access: "lab.read",
  handler: (ctx) => runs.history(ctx, "fixture", "fixture"),
});

/** Keeps a screenshot as evidence. Takes the image base64-encoded because an action cannot store a file itself. */
export const keepScreenshot = app.mutation({
  access: "lab.write",
  args: { label: s.string({ minLength: 1, maxLength: 80 }), png: s.string(), width: s.number(), height: s.number() },
  handler: async (ctx, { label, png, width, height }) => {
    const file = await ctx.services.files.upload({ name: `${label}.png`, contentType: "image/png", content: new Uint8Array(Buffer.from(png, "base64")), metadata: { kind: "screenshot" } });
    return ctx.db.insert(screenshots, { fileId: file.id, label, width, height, bytes: file.size, ...(file.checksum ? { checksum: file.checksum } : {}), capturedAt: Date.now(), capturedBy: ctx.auth.requirePrincipal().id });
  },
});

export const recordRun = app.mutation({
  access: "lab.write",
  args: { passed: s.boolean(), before: s.string(), after: s.string(), initial: s.string(), final: s.string() },
  handler: (ctx, run) => runs.record(ctx, { subject: "fixture", id: "fixture", type: run.passed ? "fixture.passed" : "fixture.failed", data: run }),
});

async function capture(ctx: ActionCtx, label: string): Promise<{ id: string; png: Uint8Array }> {
  const shot = (await ctx.integrations.invoke("desktop.screenshot.capture", {})) as Shot;
  const id = await ctx.runMutation(api.lab.keepScreenshot, { label, png: shot.data, width: shot.width, height: shot.height });
  return { id, png: new Uint8Array(Buffer.from(shot.data, "base64")) };
}

/** Captures the screen and keeps it. */
export const screenshot = app.action({
  access: "lab.write",
  args: { label: s.optional(s.string({ minLength: 1, maxLength: 80 })) },
  handler: async (ctx, { label }): Promise<string> => (await capture(ctx, label ?? "manual")).id,
});

type Run = { passed: boolean; initial: string; final: string; before: string; after: string };

/** Reloads the fixture, types the expected value, submits it, and reads the result from the banner color. */
export const runFixture = app.action({
  access: "lab.write",
  handler: async (ctx): Promise<Run> => {
    const desktop = (capability: string, input: Record<string, unknown>) => ctx.integrations.invoke(capability, input);
    await desktop("desktop.input.keyboard", { keys: ["F5"] });
    await sleep(1500);
    const before = await capture(ctx, "fixture-before");
    await desktop("desktop.input.pointer", { action: "click", ...FIXTURE.input });
    await desktop("desktop.input.keyboard", { text: FIXTURE.value });
    await desktop("desktop.input.pointer", { action: "click", ...FIXTURE.button });
    await sleep(800);
    const after = await capture(ctx, "fixture-after");
    const initial = fixtureState(before.png).state;
    const final = fixtureState(after.png).state;
    const run = { passed: initial === "ready" && final === "success", initial, final, before: before.id, after: after.id };
    await ctx.runMutation(api.lab.recordRun, run);
    return run;
  },
});
