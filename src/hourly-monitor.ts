import { parseArgs, readBoolean, readNumber } from "./args.js";
import { requireNotificationDelivery, sendNotification } from "./notify.js";
import { describePlateOptions, getPlateCheckKey, scanPlates, type PlateOptions, type ScanSettings } from "./plate-checker.js";
import { loadState, saveState, type PlateMonitorState, updateStateForRun } from "./state.js";

type Watch = {
  label: string;
  options: PlateOptions;
};

const NOTIFICATION_VERSION = 1;

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

function samePlates(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(plate => rightSet.has(plate));
}

async function runWatch(
  watch: Watch,
  state: PlateMonitorState,
  settings: ScanSettings,
  notifyOnFirstRun: boolean
) {
  const key = getPlateCheckKey(watch.options);
  const hadState = Boolean(state.checks[key]);
  const previousAvailable = state.checks[key]?.lastAvailable ?? [];

  console.log(`Checking ${watch.label}: ${describePlateOptions(watch.options)}...`);
  const result = await scanPlates(watch.options, settings);
  if (result.errors > 0) {
    throw new Error(`${watch.label} scan failed for ${result.errors} batch(es); state was not saved.`);
  }
  const newlyAvailable = updateStateForRun(state, key, result.available, { notifyOnFirstRun });

  console.log(
    `${watch.label}: checked ${result.checked}, available ${result.available.length}, ` +
    `new ${newlyAvailable.length}, errors ${result.errors}`
  );

  return {
    label: watch.label,
    available: result.available,
    newlyAvailable,
    stateChanged: !hadState || !samePlates(previousAvailable, result.available),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const notifyOnFirstRun = readBoolean(args["notify-on-first-run"]);
  const notifyCurrent = readBoolean(args["notify-current"]);
  const settings: ScanSettings = {
    concurrency: readNumber(args.concurrency, 2),
    delayMs: readNumber(args["delay-ms"], 250),
  };
  const state = loadState();
  const needsRecoveryNotification = (state.notificationVersion ?? 0) < NOTIFICATION_VERSION;
  const results = [];
  let stateChanged = false;

  for (const watch of WATCHES) {
    const result = await runWatch(watch, state, settings, notifyOnFirstRun);
    results.push(result);
    stateChanged = stateChanged || result.stateChanged;
  }

  const groupsToNotify = dedupeByMessageOrder(
    results.map(result => ({
      label: result.label,
      newlyAvailable: notifyCurrent || needsRecoveryNotification ? result.available : result.newlyAvailable,
    }))
  );
  if (groupsToNotify.length === 0 && !needsRecoveryNotification) {
    console.log(notifyCurrent ? "No currently available plates to notify." : "No new plates to notify.");
    if (stateChanged) saveState(state);
    return;
  }

  const plateMessage = groupsToNotify
    .map(group => `${group.label}: ${formatPlateList(group.newlyAvailable)}`)
    .join("\n\n");
  const title = needsRecoveryNotification
    ? "Florida plate monitor restored"
    : notifyCurrent
      ? "Current Florida plates available"
      : "New Florida plates available";
  const message = needsRecoveryNotification
    ? plateMessage
      ? `Alerts are working again. Current availability:\n\n${plateMessage}`
      : "Alerts are working again. This check found no currently available plates."
    : plateMessage;

  const notification = await sendNotification({
    title,
    message,
  });
  requireNotificationDelivery(notification);
  console.log(`Notification sent through: ${notification.channels.join(", ")}`);

  if (needsRecoveryNotification) {
    state.notificationVersion = NOTIFICATION_VERSION;
    stateChanged = true;
  }
  if (stateChanged) saveState(state);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
