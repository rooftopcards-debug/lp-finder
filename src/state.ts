import fs from "node:fs";
import path from "node:path";

export type PlateCheckEntry = {
  seen: string[];
  lastAvailable: string[];
  lastRunAt: string;
};

export type PlateMonitorState = {
  checks: Record<string, PlateCheckEntry>;
  notificationVersion?: number;
};

export type StateUpdateOptions = {
  notifyOnFirstRun?: boolean;
};

export const DEFAULT_STATE_FILE = path.join(process.cwd(), "data", "plate-monitor-state.json");

export function loadState(filePath = DEFAULT_STATE_FILE): PlateMonitorState {
  if (!fs.existsSync(filePath)) return { checks: {} };

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return { checks: {} };

  const parsed = JSON.parse(raw) as PlateMonitorState;
  return {
    checks: parsed.checks ?? {},
    ...(typeof parsed.notificationVersion === "number"
      ? { notificationVersion: parsed.notificationVersion }
      : {}),
  };
}

export function saveState(state: PlateMonitorState, filePath = DEFAULT_STATE_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function updateStateForRun(
  state: PlateMonitorState,
  key: string,
  available: string[],
  options: StateUpdateOptions = {}
) {
  const currentAvailable = [...new Set(available)].sort();
  const existing = state.checks[key];
  const previouslySeen = new Set(existing?.seen ?? []);
  const previouslyAvailable = new Set(existing?.lastAvailable ?? []);
  const newlyAvailable = existing || options.notifyOnFirstRun
    ? currentAvailable.filter(plate => !previouslyAvailable.has(plate))
    : [];

  for (const plate of currentAvailable) previouslySeen.add(plate);

  state.checks[key] = {
    seen: [...previouslySeen].sort(),
    lastAvailable: currentAvailable,
    lastRunAt: new Date().toISOString(),
  };

  return newlyAvailable;
}
