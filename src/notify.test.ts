import assert from "node:assert/strict";
import test from "node:test";
import { buildNtfyUrl, requireNotificationDelivery } from "./notify.js";

test("ntfy uses the public server when NTFY_SERVER is missing or blank", () => {
  assert.equal(buildNtfyUrl("plate-topic"), "https://ntfy.sh/plate-topic");
  assert.equal(buildNtfyUrl("plate-topic", ""), "https://ntfy.sh/plate-topic");
  assert.equal(buildNtfyUrl("plate-topic", "   "), "https://ntfy.sh/plate-topic");
});

test("ntfy normalizes custom servers and topics", () => {
  assert.equal(buildNtfyUrl(" /plate topic/ ", "https://alerts.example.com/"), "https://alerts.example.com/plate%20topic");
});

test("failed notification delivery is fatal", () => {
  assert.throws(
    () => requireNotificationDelivery({ sent: false, channels: [] }),
    /No notification was delivered/
  );
});
