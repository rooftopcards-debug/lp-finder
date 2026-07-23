import http from "node:http";
import os from "node:os";
import { parseArgs, readNumber } from "./args.js";
import { describePlateOptions, getPlateCheckKey, scanPlates, type PlateOptions } from "./plate-checker.js";
import { loadState, saveState, updateStateForRun } from "./state.js";

const args = parseArgs(process.argv.slice(2));
const port = readNumber(args.port, Number(process.env.PORT ?? 3000));

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy(new Error("Request body too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendText(res: http.ServerResponse, statusCode: number, contentType: string, body: string) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown) {
  sendText(res, statusCode, "application/json; charset=utf-8", JSON.stringify(body));
}

function parseScanOptions(value: unknown): PlateOptions {
  const options = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const characterSet = typeof options.characterSet === "string" ? options.characterSet : "";
  const onlyNumbers = characterSet === "numbers" || options.onlyNumbers === true;
  const includeNumbers = characterSet === "letters-numbers" || onlyNumbers || options.includeNumbers === true;

  return {
    length: typeof options.length === "number" ? options.length : Number(options.length ?? 2),
    exactLength: options.exactLength !== false,
    includeNumbers,
    onlyNumbers,
    coolNumberPatternsOnly: options.coolNumberPatternsOnly === true,
    sameCharacterOnly: options.sameCharacterOnly === true,
    includeHyphens: options.includeHyphens === true,
  };
}

function getLocalUrls() {
  const urls = [`http://localhost:${port}`];

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }

  return urls;
}

async function handleScan(req: http.IncomingMessage, res: http.ServerResponse) {
  const rawBody = await readBody(req);
  const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
  const options = parseScanOptions(body.options);
  const result = await scanPlates(options, {
    concurrency: 2,
    delayMs: 250,
  });
  if (result.errors > 0) {
    throw new Error(`Plate scan failed for ${result.errors} batch(es); partial results were discarded.`);
  }

  const state = loadState();
  const key = getPlateCheckKey(options);
  const newlyAvailable = updateStateForRun(state, key, result.available);
  saveState(state);

  sendJson(res, 200, {
    description: describePlateOptions(options),
    checked: result.checked,
    available: result.available,
    newlyAvailable,
    durationMs: result.durationMs,
    errors: result.errors,
    finishedAt: result.finishedAt,
  });
}

function appIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="22" fill="#f7f8f5"/>
  <rect x="18" y="38" width="92" height="52" rx="10" fill="#ffffff" stroke="#176b4d" stroke-width="6"/>
  <circle cx="34" cy="64" r="5" fill="#176b4d"/>
  <circle cx="94" cy="64" r="5" fill="#176b4d"/>
  <text x="64" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#16201b">FL</text>
</svg>`;
}

function manifest() {
  return JSON.stringify({
    name: "FL Plate Scanner",
    short_name: "FL Plates",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#176b4d",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "128x128",
        type: "image/svg+xml",
      },
    ],
  });
}

function html() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#176b4d">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="FL Plates">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/app-icon.svg">
  <title>FL Plate Scanner</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8f5;
      --surface: #ffffff;
      --ink: #16201b;
      --muted: #687168;
      --line: #d9dfd8;
      --primary: #176b4d;
      --primary-ink: #ffffff;
      --accent: #b85d1a;
      --soft: #eef4ef;
      --danger: #b42318;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    .app {
      width: min(920px, 100%);
      margin: 0 auto;
      padding: max(18px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 0 18px;
      border-bottom: 1px solid var(--line);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .mark {
      display: grid;
      place-items: center;
      width: 50px;
      height: 34px;
      border: 3px solid var(--primary);
      border-radius: 8px;
      background: var(--surface);
      font-weight: 800;
    }

    h1 {
      margin: 0;
      font-size: 1.35rem;
      line-height: 1.1;
    }

    .subtitle {
      margin: 3px 0 0;
      color: var(--muted);
      font-size: .92rem;
    }

    main {
      display: grid;
      grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
      gap: 18px;
      padding-top: 18px;
    }

    section {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 1rem;
    }

    .quick {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 16px;
    }

    button, select, input {
      font: inherit;
    }

    button {
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--ink);
      font-weight: 700;
      cursor: pointer;
    }

    button.primary {
      border-color: var(--primary);
      background: var(--primary);
      color: var(--primary-ink);
    }

    button:disabled {
      cursor: wait;
      opacity: .68;
    }

    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: .86rem;
      font-weight: 700;
    }

    select {
      min-height: 42px;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--ink);
      padding: 0 10px;
    }

    .fields {
      display: grid;
      gap: 12px;
    }

    .checks {
      display: grid;
      gap: 9px;
      margin: 14px 0;
    }

    .checks label {
      grid-template-columns: 22px 1fr;
      align-items: center;
      gap: 9px;
      color: var(--ink);
      font-weight: 600;
    }

    input[type="checkbox"] {
      width: 20px;
      height: 20px;
      accent-color: var(--primary);
    }

    .status {
      min-height: 28px;
      margin: 0 0 12px;
      color: var(--muted);
      font-size: .94rem;
      line-height: 1.4;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .stat {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: var(--soft);
    }

    .stat span {
      display: block;
      color: var(--muted);
      font-size: .74rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .stat strong {
      display: block;
      margin-top: 2px;
      font-size: 1.2rem;
    }

    .plates {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 46px;
      align-content: flex-start;
    }

    .plate {
      min-width: 54px;
      border: 1px solid #b9c4bb;
      border-radius: 7px;
      padding: 8px 10px;
      background: #ffffff;
      text-align: center;
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-weight: 800;
      letter-spacing: 0;
    }

    .plate.new {
      border-color: var(--accent);
      background: #fff4ec;
      color: #7a3510;
    }

    @media (max-width: 720px) {
      .app { padding-left: 12px; padding-right: 12px; }
      header { align-items: flex-start; }
      main { grid-template-columns: 1fr; }
      .quick { grid-template-columns: 1fr; }
      .stats { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="brand">
        <div class="mark">FL</div>
        <div>
          <h1>Plate Scanner</h1>
          <p class="subtitle">Florida personalized plate availability</p>
        </div>
      </div>
    </header>

    <main>
      <section>
        <h2>Scan</h2>
        <div class="quick">
          <button class="primary" type="button" data-preset="one">1 char</button>
          <button type="button" data-preset="two">2 letters</button>
        </div>

        <form id="scan-form">
          <div class="fields">
            <label>
              Length
              <select id="length">
                <option value="1">1 character</option>
                <option value="2" selected>2 characters</option>
                <option value="3">3 characters</option>
                <option value="4">4 characters</option>
                <option value="5">5 characters</option>
                <option value="6">6 characters</option>
                <option value="7">7 characters</option>
              </select>
            </label>

            <label>
              Characters
              <select id="character-set">
                <option value="letters">Letters</option>
                <option value="letters-numbers">Letters and numbers</option>
                <option value="numbers">Numbers</option>
              </select>
            </label>
          </div>

          <div class="checks">
            <label><input id="exact" type="checkbox" checked> Exact length</label>
            <label><input id="hyphens" type="checkbox"> Include hyphens</label>
            <label><input id="same" type="checkbox"> Same character only</label>
            <label><input id="cool" type="checkbox"> Cool number patterns</label>
          </div>

          <button class="primary" id="scan-button" type="submit">Run scan</button>
        </form>
      </section>

      <section>
        <h2>Results</h2>
        <p class="status" id="status">Ready.</p>
        <div class="stats">
          <div class="stat"><span>Checked</span><strong id="checked">0</strong></div>
          <div class="stat"><span>Available</span><strong id="available-count">0</strong></div>
          <div class="stat"><span>New</span><strong id="new-count">0</strong></div>
        </div>
        <div class="plates" id="plates"></div>
      </section>
    </main>
  </div>

  <script>
    const form = document.querySelector("#scan-form");
    const buttons = Array.from(document.querySelectorAll("button"));
    const statusEl = document.querySelector("#status");
    const checkedEl = document.querySelector("#checked");
    const availableCountEl = document.querySelector("#available-count");
    const newCountEl = document.querySelector("#new-count");
    const platesEl = document.querySelector("#plates");

    function formOptions() {
      return {
        length: Number(document.querySelector("#length").value),
        characterSet: document.querySelector("#character-set").value,
        exactLength: document.querySelector("#exact").checked,
        includeHyphens: document.querySelector("#hyphens").checked,
        sameCharacterOnly: document.querySelector("#same").checked,
        coolNumberPatternsOnly: document.querySelector("#cool").checked
      };
    }

    function setBusy(isBusy) {
      for (const button of buttons) button.disabled = isBusy;
    }

    function renderPlates(available, fresh) {
      platesEl.textContent = "";
      const freshSet = new Set(fresh);

      if (available.length === 0) {
        const empty = document.createElement("span");
        empty.className = "status";
        empty.textContent = "No available plates found.";
        platesEl.append(empty);
        return;
      }

      for (const plate of available) {
        const node = document.createElement("span");
        node.className = freshSet.has(plate) ? "plate new" : "plate";
        node.textContent = plate;
        platesEl.append(node);
      }
    }

    async function runScan(options) {
      setBusy(true);
      statusEl.textContent = "Checking Florida availability...";

      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ options })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Scan failed.");

        checkedEl.textContent = data.checked.toLocaleString();
        availableCountEl.textContent = data.available.length.toLocaleString();
        newCountEl.textContent = data.newlyAvailable.length.toLocaleString();
        statusEl.textContent = data.description + " finished in " + (data.durationMs / 1000).toFixed(1) + "s.";
        renderPlates(data.available, data.newlyAvailable);
      } catch (error) {
        statusEl.textContent = error instanceof Error ? error.message : "Scan failed.";
      } finally {
        setBusy(false);
      }
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      runScan(formOptions());
    });

    document.querySelector('[data-preset="one"]').addEventListener("click", () => {
      runScan({ length: 1, exactLength: true, characterSet: "letters-numbers" });
    });

    document.querySelector('[data-preset="two"]').addEventListener("click", () => {
      runScan({ length: 2, exactLength: true, characterSet: "letters" });
    });
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      sendText(res, 200, "text/html; charset=utf-8", html());
      return;
    }

    if (req.method === "GET" && url.pathname === "/manifest.webmanifest") {
      sendText(res, 200, "application/manifest+json; charset=utf-8", manifest());
      return;
    }

    if (req.method === "GET" && url.pathname === "/app-icon.svg") {
      sendText(res, 200, "image/svg+xml; charset=utf-8", appIcon());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/scan") {
      await handleScan(req, res);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 500, { error: message });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log("FL Plate Scanner is running:");
  for (const url of getLocalUrls()) console.log(`  ${url}`);
});
