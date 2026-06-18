import { parseArgs, readBoolean, readNumber } from "./args.js";
import { sendNotification } from "./notify.js";
import { describePlateOptions, getPlateCheckKey, scanPlates, type PlateOptions, type ScanSettings } from "./plate-checker.js";
import { loadState, saveState, type PlateMonitorState, updateStateForRun } from "./state.js";

type Watch = {
  label: string;
  options: PlateOptions;
};

const WATCHES: Watch[] = [
  {
    label: "1 character",
    options: { length: 1, exactLength: true, includeNumbers: true },
  },
  {
    label: "2 characters",
    options: { length: 2, exactLength: true, includeNumbers: true },
  },
  {
    label: "cool numbers",
    options: { length: 7, exactLength: false, onlyNumbers: true, coolNumberPatternsOnly: true },
  },
  {
    label: "same character",
    options: { length: 7, exactLength: false, includeNumbers: true, sameCharacterOnly: true },
  },
];

function formatPlateList(plates: string[]) {
  const shown = plates.slice(0, 40);
  const extra = plates.length > shown.length ? ` and ${plates.length - shown.length} more` : "";
  return `${shown.join(", ")}${extra}`;
}

function dedupeByMessageOrder(groups: Array<{ label: string; newlyAvailable: string[] }>) {
  const alreadyIncluded = new Set<string>();

  return groups
    .map(group => {
      const newlyAvailable = group.newlyAvailable.filter(plate => {
        if (alreadyIncluded.has(plate)) return false;
        alreadyIncluded.add(plate);
        return true;
      });

      return { ...group, newlyAvailable };
    })
    .filter(group => group.newlyAvailable.length > 0);
}

async function runWatch(
  watch: Watch,
  state: PlateMonitorState,
  settings: ScanSettings,
  notifyOnFirstRun: boolean
) {
  const key = getPlateCheckKey(watch.options);
  const hadState = Boolean(state.checks[key]);

  console.log(`Checking ${watch.label}: ${describePlateOptions(watch.options)}...`);
  const result = await scanPlates(watch.options, settings);
  const newlyAvailable = updateStateForRun(state, key, result.available, { notifyOnFirstRun });

  console.log(
    `${watch.label}: checked ${result.checked}, available ${result.available.length}, ` +
    `new ${newlyAvailable.length}, errors ${result.errors}`
  );

  return {
    label: watch.label,
    newlyAvailable,
    stateChanged: !hadState || newlyAvailable.length > 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const notifyOnFirstRun = readBoolean(args["notify-on-first-run"]);
  const settings: ScanSettings = {
    concurrency: readNumber(args.concurrency, 2),
    delayMs: readNumber(args["delay-ms"], 250),
  };
  const state = loadState();
  const results = [];
  let stateChanged = false;

  for (const watch of WATCHES) {
    const result = await runWatch(watch, state, settings, notifyOnFirstRun);
    results.push(result);
    stateChanged = stateChanged || result.stateChanged;
  }

  if (stateChanged) saveState(state);

  const groupsToNotify = dedupeByMessageOrder(results);
  if (groupsToNotify.length === 0) {
    console.log("No new plates to notify.");
    return;
  }

  const message = groupsToNotify
    .map(group => `${group.label}: ${formatPlateList(group.newlyAvailable)}`)
    .join("\n\n");

  await sendNotification({
    title: "New Florida plates available",
    message,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
