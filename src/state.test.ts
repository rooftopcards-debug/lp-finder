import assert from "node:assert/strict";
import test from "node:test";
import { updateStateForRun, type PlateMonitorState } from "./state.js";

test("a first baseline is silent, then a newly available plate is reported", () => {
  const state: PlateMonitorState = { checks: {} };

  assert.deepEqual(updateStateForRun(state, "two-character", ["AA"]), []);
  assert.deepEqual(updateStateForRun(state, "two-character", ["AA", "NZ"]), ["NZ"]);
});

test("a plate is reported again after it disappears and returns", () => {
  const state: PlateMonitorState = { checks: {} };

  updateStateForRun(state, "two-character", ["GW"]);
  assert.deepEqual(updateStateForRun(state, "two-character", []), []);
  assert.deepEqual(updateStateForRun(state, "two-character", ["GW"]), ["GW"]);
  assert.deepEqual(state.checks["two-character"]?.seen, ["GW"]);
});

test("notifyOnFirstRun reports the first available baseline", () => {
  const state: PlateMonitorState = { checks: {} };

  assert.deepEqual(
    updateStateForRun(state, "current", ["543210", "BBBBBBB"], { notifyOnFirstRun: true }),
    ["543210", "BBBBBBB"]
  );
});
