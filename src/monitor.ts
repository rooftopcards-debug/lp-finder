import { parseArgs, readBoolean, readNumber } from "./args.js";
import { requireNotificationDelivery, sendNotification } from "./notify.js";
import { describePlateOptions, getPlateCheckKey, scanPlates, type PlateOptions, type ScanSettings } from "./plate-checker.js";
import { loadState, saveState, updateStateForRun } from "./state.js";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getOptionsFromArgs(): PlateOptions {
  const args = parseArgs(process.argv.slice(2));
  const onlyNumbers = readBoolean(args["only-numbers"]);
  const lettersOnly = readBoolean(args["letters-only"]);

  return {
    length: readNumber(args.length, 1),
    exactLength: readBoolean(args.exact, !readBoolean(args["up-to"])),
    includeNumbers: lettersOnly ? false : onlyNumbers || readBoolean(args["include-numbers"], true),
    onlyNumbers,
    coolNumberPatternsOnly: readBoolean(args["cool-numbers"]),
    sameCharacterOnly: readBoolean(args["same-character"]),
    includeHyphens: readBoolean(args.hyphens),
  };
}

async function runOnce(options: PlateOptions, settings: ScanSettings) {
  console.log(`Checking ${describePlateOptions(options)}...`);
  const result = await scanPlates(options, settings);
  if (result.errors > 0) {
    throw new Error(`Plate scan failed for ${result.errors} batch(es); state was not saved.`);
  }
  const state = loadState();
  const key = getPlateCheckKey(options);
  const newlyAvailable = updateStateForRun(state, key, result.available);

  console.log(
    `Checked ${result.checked} plates in ${(result.durationMs / 1000).toFixed(1)}s. ` +
    `Available: ${result.available.length}. New: ${newlyAvailable.length}.`
  );

  if (newlyAvailable.length === 0) {
    saveState(state);
    return;
  }

  const preview = newlyAvailable.slice(0, 25).join(", ");
  const extra = newlyAvailable.length > 25 ? ` and ${newlyAvailable.length - 25} more` : "";
  const notification = await sendNotification({
    title: "Florida plate availability",
    message: `${newlyAvailable.length} new ${describePlateOptions(options)} plate(s): ${preview}${extra}`,
  });
  requireNotificationDelivery(notification);
  console.log(`Notification sent through: ${notification.channels.join(", ")}`);
  saveState(state);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = getOptionsFromArgs();
  const once = readBoolean(args.once);
  const intervalMinutes = Math.max(5, readNumber(args["interval-minutes"], 15));
  const settings: ScanSettings = {
    concurrency: readNumber(args.concurrency, 2),
    delayMs: readNumber(args["delay-ms"], 250),
  };

  if (once) {
    await runOnce(options, settings);
    return;
  }

  console.log(`Monitoring ${describePlateOptions(options)} every ${intervalMinutes} minutes.`);
  console.log("Press Ctrl+C to stop.");

  while (true) {
    await runOnce(options, settings);
    await sleep(intervalMinutes * 60 * 1000);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
