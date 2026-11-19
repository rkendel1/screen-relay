/**
 * Screen Relay Lab: a FeltKit application that operates one Screen Relay desktop and keeps evidence of what it did.
 *
 * The desktop is a separately running Screen Relay session (`screen-relay up`); this app connects to its engine.
 * State and evidence live in this app's one FeltDB instance. Video never does: the browser reads the engine's stream.
 */
import { feltkit, s } from "@feltdb/feltkit";

export const app = feltkit({
  name: "screen-relay-lab",
  description: "Operate a Screen Relay desktop from a FeltKit app and keep evidence of every interaction.",
  roles: {
    operator: ["desktop.*", "files.read", "files.write"],
    observer: ["desktop.read", "files.read"],
  },
  dev: {
    users: [
      { id: "ada", name: "Ada Lovelace", roles: ["operator"] },
      { id: "grace", name: "Grace Hopper", roles: ["observer"] },
    ],
  },
  services: { files: true },
});

export const connections = app.collection("connections", {
  host: s.string(),
  state: s.enum(["connected", "disconnected", "failed"]),
  backend: s.optional(s.string()),
  width: s.optional(s.number()),
  height: s.optional(s.number()),
  openedAt: s.number(),
  openedBy: s.string(),
  closedAt: s.optional(s.number()),
  closedBy: s.optional(s.string()),
  error: s.optional(s.string()),
  lastInteractionAt: s.optional(s.number()),
  lastScreenshotAt: s.optional(s.number()),
});

export const screenshots = app.collection("screenshots", {
  connectionId: s.string(),
  fileId: s.string(),
  label: s.string({ maxLength: 80 }),
  width: s.number(),
  height: s.number(),
  bytes: s.number(),
  checksum: s.optional(s.string()),
  capturedAt: s.number(),
  capturedBy: s.string(),
}, { indexes: [{ fields: ["connectionId", "capturedAt"] }] });

export const events = app.auditTrail("events", { subjects: ["connection"] as const });
