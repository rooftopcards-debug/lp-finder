import assert from "node:assert/strict";
import test from "node:test";
import { parseAvailableResponse } from "./plate-checker.js";

test("plate responses distinguish available and unavailable rows", () => {
  const html = `
    <span id="MainContent_lblOutPutRowOne">AVAILABLE</span>
    <span id="MainContent_lblOutPutRowTwo">NOT AVAILABLE</span>
  `;

  assert.deepEqual(parseAvailableResponse(html, ["GW", "NZ"]), ["GW"]);
});

test("missing plate result rows are rejected instead of treated as unavailable", () => {
  assert.throws(
    () => parseAvailableResponse("<html><body>Service unavailable</body></html>", ["GW"]),
    /missing result row 1/
  );
});

test("unknown plate statuses are rejected", () => {
  const html = '<span id="MainContent_lblOutPutRowOne">TRY AGAIN LATER</span>';
  assert.throws(() => parseAvailableResponse(html, ["GW"]), /unknown result/);
});
