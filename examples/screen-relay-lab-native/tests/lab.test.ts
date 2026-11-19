/**
 * Run with `npm test`. The live test operates a real Screen Relay desktop: start one with `screen-relay up -d`,
 * open the fixture with `fixture/open.sh`, then run `LAB_LIVE=1 npm test`. Without LAB_LIVE it is skipped, never faked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "@feltdb/feltkit/testing";
import { api } from "../feltkit/_generated/api.js";

const live = process.env.LAB_LIVE === "1";

test("observers read the evidence but cannot run the fixture; anonymous callers can do neither", async () => {
  process.env.SCREEN_RELAY_URL = "http://127.0.0.1:9";
  const t = await createTestApp();
  try {
    assert.deepEqual(await t.as("grace").query(api.lab.history), []);
    await assert.rejects(t.as("grace").action(api.lab.runFixture), { code: "FORBIDDEN" });
    await assert.rejects(t.as("grace").mutation(api.lab.recordRun, { passed: true, before: "x", after: "x", initial: "x", final: "x" }), { code: "FORBIDDEN" });
    await assert.rejects(t.query(api.lab.history), { code: "UNAUTHORIZED" });
  } finally {
    delete process.env.SCREEN_RELAY_URL;
    await t.close();
  }
});

test("an unreachable desktop fails honestly and leaves no evidence", async () => {
  process.env.SCREEN_RELAY_URL = "http://127.0.0.1:9";
  const t = await createTestApp();
  try {
    await assert.rejects(t.as("ada").action(api.lab.screenshot, {}), (error: any) => /unreachable/.test(error.message));
    assert.deepEqual(await t.as("ada").query(api.lab.screenshotList), []);
  } finally {
    delete process.env.SCREEN_RELAY_URL;
    await t.close();
  }
});

test("the composed provider operates a real desktop and the evidence survives a restart", { skip: live ? false : "set LAB_LIVE=1 with a running desktop and the fixture open" }, async () => {
  const t = await createTestApp();
  try {
    const run = await t.as("ada").action(api.lab.runFixture);
    assert.deepEqual({ passed: run.passed, initial: run.initial, final: run.final }, { passed: true, initial: "ready", final: "success" });
    await t.restart();
    const shots = await t.as("grace").query(api.lab.screenshotList);
    assert.deepEqual(shots.map((s) => s.label).sort(), ["fixture-after", "fixture-before"]);
    const [record] = await t.as("grace").query(api.lab.history);
    assert.equal(record!.type, "fixture.passed");
    assert.equal(record!.actor, "ada");
    assert.doesNotMatch(JSON.stringify([shots, record]), /ticket|token|grant|bearer/i);
  } finally {
    await t.close();
  }
});
