/**
 * Screen Relay Lab, natively composed: the Screen Relay provider's desktop capabilities join this application's own,
 * authorized by its roles. The application keeps only its own evidence: screenshots and fixture runs.
 */
import { feltkit, s } from "@feltdb/feltkit";

export const app = feltkit({
  name: "screen-relay-lab-native",
  description: "Operate a Screen Relay desktop through its AppPort provider and keep evidence of every interaction.",
  roles: {
    operator: ["desktop.*", "lab.*", "files.read", "files.write"],
    observer: ["desktop.view", "lab.read", "files.read"],
  },
  dev: {
    users: [
      { id: "ada", name: "Ada Lovelace", roles: ["operator"] },
      { id: "grace", name: "Grace Hopper", roles: ["observer"] },
    ],
  },
  services: { files: true },
  providers: {
    desktop: { module: "@appport/screen-relay/provider", export: "screenRelayProvider", config: { url: process.env.SCREEN_RELAY_URL ?? "http://127.0.0.1:8080" } },
  },
});

export const screenshots = app.collection("screenshots", {
  fileId: s.string(),
  label: s.string({ maxLength: 80 }),
  width: s.number(),
  height: s.number(),
  bytes: s.number(),
  checksum: s.optional(s.string()),
  capturedAt: s.number(),
  capturedBy: s.string(),
}, { indexes: [{ fields: ["capturedAt"] }] });

export const runs = app.auditTrail("runs", { subjects: ["fixture"] as const });
