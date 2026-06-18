import fs from "node:fs";
import readline from "node:readline";
import { describePlateOptions, scanPlates, type PlateOptions, type ScanSettings } from "./plate-checker.js";
import { parseArgs, readBoolean, readNumber, type ParsedArgs } from "./args.js";

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

function printHelp() {
  console.log(`Florida plate checker

Usage:
  npm start
  npm start -- --length=2 --exact --letters-only
  npm start -- --length=1 --exact --include-numbers

Options:
  --length <1-7>          Plate character length
  --exact                 Check exactly that length
  --up-to                 Check 1 through the selected length
  --letters-only          A-Z only
  --include-numbers       A-Z and 0-9
  --only-numbers          0-9 only
  --hyphens               Include hyphen variants
  --same-character        Only plates like AA, BBB, 11
  --cool-numbers          Only number patterns like 111, 123, 100
  --concurrency <1-10>    Parallel requests, default 2
  --delay-ms <ms>         Delay after each batch, default 250`);
}

function getOptionsFromArgs(args: ParsedArgs): PlateOptions {
  const onlyNumbers = readBoolean(args["only-numbers"]);
  const lettersOnly = readBoolean(args["letters-only"]);
  const includeNumbers = lettersOnly ? false : onlyNumbers || readBoolean(args["include-numbers"]);

  return {
    length: readNumber(args.length, 2),
    exactLength: readBoolean(args.exact, !readBoolean(args["up-to"])),
    includeNumbers,
    onlyNumbers,
    coolNumberPatternsOnly: readBoolean(args["cool-numbers"]),
    sameCharacterOnly: readBoolean(args["same-character"]),
    includeHyphens: readBoolean(args.hyphens),
  };
}

async function askYesNo(rl: readline.Interface, query: string, fallback = false) {
  while (true) {
    const answer = (await question(rl, query)).trim().toLowerCase();
    if (!answer) return fallback;
    if (["y", "yes"].includes(answer)) return true;
    if (["n", "no"].includes(answer)) return false;
    console.log("Please enter y or n.");
  }
}

async function getInteractiveOptions(): Promise<PlateOptions> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("=== Florida License Plate Checker ===\n");

    let length = 2;
    while (true) {
      const answer = await question(rl, "How many characters? (1 through 7): ");
      const parsed = Number(answer.trim());
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
        length = parsed;
        break;
      }
      console.log("Please enter a number from 1 through 7.");
    }

    const exactLength = await askYesNo(rl, "Exact length only? (Y/n): ", true);
    const includeNumbers = await askYesNo(rl, "Include numbers? (y/N): ", false);
    const onlyNumbers = includeNumbers ? await askYesNo(rl, "Only numbers? (y/N): ", false) : false;
    const coolNumberPatternsOnly = onlyNumbers
      ? await askYesNo(rl, "Only cool number patterns? (y/N): ", false)
      : false;
    const sameCharacterOnly = await askYesNo(rl, "Only same-character plates? (y/N): ", false);
    const includeHyphens = await askYesNo(rl, "Include hyphens? (y/N): ", false);

    return {
      length,
      exactLength,
      includeNumbers,
      onlyNumbers,
      coolNumberPatternsOnly,
      sameCharacterOnly,
      includeHyphens,
    };
  } finally {
    rl.close();
  }
}

function outputFileName(options: PlateOptions) {
  const description = describePlateOptions(options)
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return `available_plates_${description}_${Date.now()}.txt`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (readBoolean(args.help) || readBoolean(args.h)) {
    printHelp();
    return;
  }

  const options = process.argv.slice(2).length > 0 ? getOptionsFromArgs(args) : await getInteractiveOptions();
  const settings: ScanSettings = {
    concurrency: readNumber(args.concurrency, 2),
    delayMs: readNumber(args["delay-ms"], 250),
    onProgress: (() => {
      let lastLogAt = 0;
      return progress => {
        const now = Date.now();
        const shouldLog = now - lastLogAt > 1000 || progress.completedBatches === progress.totalBatches;
        if (!shouldLog) return;

        lastLogAt = now;
        const percent = progress.total === 0 ? "100.0" : ((progress.checked / progress.total) * 100).toFixed(1);
        console.log(
          `Checked ${progress.checked}/${progress.total} (${percent}%) | Available: ${progress.found} | Errors: ${progress.errors}`
        );
      };
    })(),
  };

  console.log(`\nChecking ${describePlateOptions(options)}...`);
  const result = await scanPlates(options, settings);
  const fileName = outputFileName(options);

  fs.writeFileSync(fileName, result.available.join("\n") + (result.available.length ? "\n" : ""));

  console.log("");
  console.log(`Done. Checked ${result.checked} plates in ${(result.durationMs / 1000).toFixed(1)}s.`);
  console.log(`Found ${result.available.length} available.`);
  console.log(`Saved to ${fileName}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
