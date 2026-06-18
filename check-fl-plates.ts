import https from "https";
import fs from "fs";
import * as cheerio from "cheerio";
import readline from "readline";

const BASE_URL = "https://services.flhsmv.gov/mvcheckpersonalplate/";
const BATCH_SIZE = 5;
const DELAY_MS = 50;
const CONCURRENT_REQUESTS = 10; // Number of batches to process in parallel
const FORM_FIELD_REFRESH_INTERVAL = 100; // Refresh form fields every N batches

type FormFields = {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
};

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchPage(method: "GET" | "POST", body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      BASE_URL,
      {
        method,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "text/html",
        }
      },
      res => {
        let data = "";
        res.on("data", d => data += d);
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractFormFields(html: string): FormFields {
  const $ = cheerio.load(html);
  const viewState = $("#__VIEWSTATE").val();
  const viewStateGenerator = $("#__VIEWSTATEGENERATOR").val();
  const eventValidation = $("#__EVENTVALIDATION").val();

  if (!viewState || !viewStateGenerator || !eventValidation) {
    throw new Error("Failed to extract ASP.NET form fields");
  }

  return {
    viewState: viewState.toString(),
    viewStateGenerator: viewStateGenerator.toString(),
    eventValidation: eventValidation.toString(),
  };
}

function buildFormData(plates: string[], f: FormFields): string {
  const params = new URLSearchParams();

  params.append("__VIEWSTATE", f.viewState);
  params.append("__VIEWSTATEGENERATOR", f.viewStateGenerator);
  params.append("__EVENTVALIDATION", f.eventValidation);

  const fields = [
    "ctl00$MainContent$txtInputRowOne",
    "ctl00$MainContent$txtInputRowTwo",
    "ctl00$MainContent$txtInputRowThree",
    "ctl00$MainContent$txtInputRowFour",
    "ctl00$MainContent$txtInputRowFive",
  ];

  for (let i = 0; i < BATCH_SIZE; i++) {
    const field = fields[i];
    if (field) {
      params.append(field, plates[i] ?? "");
    }
  }

  params.append("ctl00$MainContent$btnSubmit", "Submit");
  return params.toString();
}

function parseAvailable(html: string, plates: string[]): string[] {
  const $ = cheerio.load(html);

  const labels = [
    "MainContent_lblOutPutRowOne",
    "MainContent_lblOutPutRowTwo",
    "MainContent_lblOutputRowThree",
    "MainContent_lblOutputRowFour",
    "MainContent_lblOutputRowFive",
  ];

  const available: string[] = [];

  plates.forEach((plate, i) => {
    const text = $(`#${labels[i]}`).text().trim().toUpperCase();
    if (text === "AVAILABLE") {
      available.push(plate);
    }
  });

  return available;
}

type PlateOptions = {
  maxLength: number; // 1, 2, 3, or 4
  includeNumbers: boolean;
  onlyNumbers: boolean;
  coolNumberPatternsOnly: boolean;
  sameCharacterOnly: boolean;
  includeHyphens: boolean;
};

function* generatePlates(options: PlateOptions): Generator<string> {
  // Generate base characters based on toggle selection
  const letters: string[] = [];
  for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++) {
    letters.push(String.fromCharCode(i));
  }
  
  const numbers: string[] = [];
  for (let i = 0; i <= 9; i++) {
    numbers.push(i.toString());
  }

  const chars = options.onlyNumbers
    ? numbers
    : options.includeNumbers
      ? [...letters, ...numbers]
      : letters;

  // Generate plates without hyphens
  for (let length = 1; length <= options.maxLength; length++) {
    yield* generateCombinations(chars, length, "");
  }

  // Generate plates with hyphens if enabled
  if (options.includeHyphens) {
    // Pattern: X- (1 char + hyphen)
    if (options.maxLength >= 1) {
      for (const char of chars) {
        yield char + "-";
      }
    }

    // Pattern: -X (hyphen + 1 char)
    if (options.maxLength >= 1) {
      for (const char of chars) {
        yield "-" + char;
      }
    }

    // Pattern: XX- (2 chars + hyphen)
    if (options.maxLength >= 2) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          yield char1 + char2 + "-";
        }
      }
    }

    // Pattern: -XX (hyphen + 2 chars)
    if (options.maxLength >= 2) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          yield "-" + char1 + char2;
        }
      }
    }

    // Pattern: X-X (1 char + hyphen + 1 char)
    if (options.maxLength >= 2) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          yield char1 + "-" + char2;
        }
      }
    }

    // Pattern: XXX- (3 chars + hyphen)
    if (options.maxLength >= 3) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            yield char1 + char2 + char3 + "-";
          }
        }
      }
    }

    // Pattern: -XXX (hyphen + 3 chars)
    if (options.maxLength >= 3) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            yield "-" + char1 + char2 + char3;
          }
        }
      }
    }

    // Pattern: X-XX (1 char + hyphen + 2 chars)
    if (options.maxLength >= 3) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            yield char1 + "-" + char2 + char3;
          }
        }
      }
    }

    // Pattern: XX-X (2 chars + hyphen + 1 char)
    if (options.maxLength >= 3) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            yield char1 + char2 + "-" + char3;
          }
        }
      }
    }

    // Pattern: X-X-X (1 char + hyphen + 1 char + hyphen + 1 char)
    if (options.maxLength >= 3) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            yield char1 + "-" + char2 + "-" + char3;
          }
        }
      }
    }

    // Pattern: XXXX- (4 chars + hyphen)
    if (options.maxLength >= 4) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            for (const char4 of chars) {
              yield char1 + char2 + char3 + char4 + "-";
            }
          }
        }
      }
    }

    // Pattern: -XXXX (hyphen + 4 chars)
    if (options.maxLength >= 4) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            for (const char4 of chars) {
              yield "-" + char1 + char2 + char3 + char4;
            }
          }
        }
      }
    }

    // Pattern: X-XXX (1 char + hyphen + 3 chars)
    if (options.maxLength >= 4) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            for (const char4 of chars) {
              yield char1 + "-" + char2 + char3 + char4;
            }
          }
        }
      }
    }

    // Pattern: XX-XX (2 chars + hyphen + 2 chars)
    if (options.maxLength >= 4) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            for (const char4 of chars) {
              yield char1 + char2 + "-" + char3 + char4;
            }
          }
        }
      }
    }

    // Pattern: XXX-X (3 chars + hyphen + 1 char)
    if (options.maxLength >= 4) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            for (const char4 of chars) {
              yield char1 + char2 + char3 + "-" + char4;
            }
          }
        }
      }
    }

    // Pattern: X-X-XX (1 char + hyphen + 1 char + hyphen + 2 chars)
    if (options.maxLength >= 4) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            for (const char4 of chars) {
              yield char1 + "-" + char2 + "-" + char3 + char4;
            }
          }
        }
      }
    }

    // Pattern: X-XX-X (1 char + hyphen + 2 chars + hyphen + 1 char)
    if (options.maxLength >= 4) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            for (const char4 of chars) {
              yield char1 + "-" + char2 + char3 + "-" + char4;
            }
          }
        }
      }
    }

    // Pattern: XX-X-X (2 chars + hyphen + 1 char + hyphen + 1 char)
    if (options.maxLength >= 4) {
      for (const char1 of chars) {
        for (const char2 of chars) {
          for (const char3 of chars) {
            for (const char4 of chars) {
              yield char1 + char2 + "-" + char3 + "-" + char4;
            }
          }
        }
      }
    }
  }
}

function* generateCombinations(chars: string[], length: number, prefix: string): Generator<string> {
  if (length === 0) {
    yield prefix;
    return;
  }
  
  for (const char of chars) {
    yield* generateCombinations(chars, length - 1, prefix + char);
  }
}

function isCanonicalOrderedDigits(digits: string): boolean {
  if (digits.length < 2 || digits.length > 10) return false;

  const ascending = Array.from({ length: digits.length }, (_, i) => i.toString()).join("");
  const descending = ascending.split("").reverse().join("");

  return digits === ascending || digits === descending;
}

function isCoolNumberPattern(plate: string): boolean {
  const digits = plate.replace(/-/g, "");
  if (!/^\d+$/.test(digits)) return false;

  if (digits.length === 1) return true;

  const allSameDigits = /^(\d)\1+$/.test(digits);
  const leadingNonZeroThenZeros = /^[1-9]0+$/.test(digits);

  return allSameDigits || isCanonicalOrderedDigits(digits) || leadingNonZeroThenZeros;
}

function isSameCharacterPlate(plate: string): boolean {
  const chars = plate.replace(/-/g, "");
  if (chars.length === 0) return false;
  return chars.split("").every(ch => ch === chars[0]);
}

async function processBatch(batch: string[], formFields: FormFields): Promise<string[]> {
  const body = buildFormData(batch, formFields);
  const html = await fetchPage("POST", body);
  return parseAvailable(html, batch);
}

async function refreshFormFields(): Promise<FormFields> {
  const landing = await fetchPage("GET");
  return extractFormFields(landing);
}

async function processBatchWithRetry(
  batch: string[],
  formFields: FormFields,
  retries = 2
): Promise<{ available: string[]; success: boolean }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const available = await processBatch(batch, formFields);
      return { available, success: true };
    } catch (error) {
      if (attempt === retries) {
        console.error(`Error processing batch ${batch.join(", ")} after ${retries + 1} attempts:`, error);
        return { available: [], success: false };
      }
      // Wait a bit longer before retry
      await sleep(DELAY_MS * 2);
    }
  }
  return { available: [], success: false };
}

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

async function getPlateOptions(): Promise<PlateOptions> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log("=== Florida License Plate Checker ===\n");

    // Get max length (1, 2, 3, or 4)
    let maxLength: number;
    while (true) {
      const answer = await question(rl, "How many letters/characters? (1, 2, 3, or 4): ");
      const num = parseInt(answer.trim());
      if ([1, 2, 3, 4].includes(num)) {
        maxLength = num;
        break;
      }
      console.log("Please enter 1, 2, 3, or 4");
    }

    // Get include numbers
    let includeNumbers: boolean;
    while (true) {
      const answer = await question(rl, "Include numbers? (y/n): ");
      const normalized = answer.trim().toLowerCase();
      if (normalized === "y" || normalized === "yes") {
        includeNumbers = true;
        break;
      } else if (normalized === "n" || normalized === "no") {
        includeNumbers = false;
        break;
      }
      console.log("Please enter 'y' or 'n'");
    }

    // Get only numbers (when numbers are enabled)
    let onlyNumbers = false;
    if (includeNumbers) {
      while (true) {
        const answer = await question(rl, "Only numbers (no letters)? (y/n): ");
        const normalized = answer.trim().toLowerCase();
        if (normalized === "y" || normalized === "yes") {
          onlyNumbers = true;
          break;
        } else if (normalized === "n" || normalized === "no") {
          onlyNumbers = false;
          break;
        }
        console.log("Please enter 'y' or 'n'");
      }
    }

    // Get cool-number filter (when only numbers is enabled)
    let coolNumberPatternsOnly = false;
    if (onlyNumbers) {
      while (true) {
        const answer = await question(
          rl,
          "Only check cool number patterns (1111, 0123, 1000)? (y/n): "
        );
        const normalized = answer.trim().toLowerCase();
        if (normalized === "y" || normalized === "yes") {
          coolNumberPatternsOnly = true;
          break;
        } else if (normalized === "n" || normalized === "no") {
          coolNumberPatternsOnly = false;
          break;
        }
        console.log("Please enter 'y' or 'n'");
      }
    }

    // Get same-character filter (applies to letters and numbers)
    let sameCharacterOnly = false;
    while (true) {
      const answer = await question(
        rl,
        "Only check same-character plates (AAAA, BBB, 1111)? (y/n): "
      );
      const normalized = answer.trim().toLowerCase();
      if (normalized === "y" || normalized === "yes") {
        sameCharacterOnly = true;
        break;
      } else if (normalized === "n" || normalized === "no") {
        sameCharacterOnly = false;
        break;
      }
      console.log("Please enter 'y' or 'n'");
    }

    // Get include hyphens
    let includeHyphens: boolean;
    while (true) {
      const answer = await question(rl, "Include hyphens (-)? (y/n): ");
      const normalized = answer.trim().toLowerCase();
      if (normalized === "y" || normalized === "yes") {
        includeHyphens = true;
        break;
      } else if (normalized === "n" || normalized === "no") {
        includeHyphens = false;
        break;
      }
      console.log("Please enter 'y' or 'n'");
    }

    return { maxLength, includeNumbers, onlyNumbers, coolNumberPatternsOnly, sameCharacterOnly, includeHyphens };
  } finally {
    rl.close();
  }
}

function calculateTotalPlates(options: PlateOptions): number {
  const charCount = options.onlyNumbers ? 10 : 26 + (options.includeNumbers ? 10 : 0);

  let total = 0;

  // Plates without hyphens
  for (let length = 1; length <= options.maxLength; length++) {
    total += Math.pow(charCount, length);
  }

  // Plates with hyphens
  if (options.includeHyphens) {
    if (options.maxLength >= 1) {
      total += charCount; // X-
      total += charCount; // -X
    }
    if (options.maxLength >= 2) {
      total += Math.pow(charCount, 2); // XX-
      total += Math.pow(charCount, 2); // -XX
      total += Math.pow(charCount, 2); // X-X
    }
    if (options.maxLength >= 3) {
      total += Math.pow(charCount, 3); // XXX-
      total += Math.pow(charCount, 3); // -XXX
      total += Math.pow(charCount, 3); // X-XX
      total += Math.pow(charCount, 3); // XX-X
      total += Math.pow(charCount, 3); // X-X-X
    }
    if (options.maxLength >= 4) {
      total += Math.pow(charCount, 4); // XXXX-
      total += Math.pow(charCount, 4); // -XXXX
      total += Math.pow(charCount, 4); // X-XXX
      total += Math.pow(charCount, 4); // XX-XX
      total += Math.pow(charCount, 4); // XXX-X
      total += Math.pow(charCount, 4); // X-X-XX
      total += Math.pow(charCount, 4); // X-XX-X
      total += Math.pow(charCount, 4); // XX-X-X
    }
  }

  return total;
}

async function main() {
  const options = await getPlateOptions();
  
  const charSet = options.onlyNumbers ? "0-9" : options.includeNumbers ? "A-Z, 0-9" : "A-Z";
  
  console.log("\n=== Configuration ===");
  console.log(`Max length: ${options.maxLength} characters`);
  console.log(`Character set: ${charSet}`);
  console.log(`Cool number filter: ${options.coolNumberPatternsOnly ? "Yes" : "No"}`);
  console.log(`Same-character filter: ${options.sameCharacterOnly ? "Yes" : "No"}`);
  console.log(`Hyphens: ${options.includeHyphens ? "Yes" : "No"}`);
  console.log("");

  const combinationsBeforeFilter = calculateTotalPlates(options);
  if (options.coolNumberPatternsOnly || options.sameCharacterOnly) {
    console.log(`Combinations before filters: ${combinationsBeforeFilter.toLocaleString()}`);
  }
  console.log(`Using ${CONCURRENT_REQUESTS} concurrent requests`);
  console.log("");

  const timestamp = Date.now();
  const outputFile = `available_plates_${options.maxLength}chars${options.onlyNumbers ? "_only_numbers" : options.includeNumbers ? "_with_numbers" : ""}${options.coolNumberPatternsOnly ? "_cool_patterns" : ""}${options.sameCharacterOnly ? "_same_char" : ""}${options.includeHyphens ? "_with_hyphens" : ""}_${timestamp}.txt`;
  
  fs.writeFileSync(outputFile, "");

  // Collect all batches first
  const allBatches: string[][] = [];
  const batch: string[] = [];
  let totalPlates = 0;

  for (const plate of generatePlates(options)) {
    if (options.sameCharacterOnly && !isSameCharacterPlate(plate)) {
      continue;
    }
    if (options.coolNumberPatternsOnly && !isCoolNumberPattern(plate)) {
      continue;
    }

    totalPlates++;
    batch.push(plate);
    if (batch.length === BATCH_SIZE) {
      allBatches.push([...batch]);
      batch.length = 0;
    }
  }

  // Add final partial batch if any
  if (batch.length > 0) {
    while (batch.length < BATCH_SIZE) {
      batch.push("");
    }
    allBatches.push([...batch]);
  }

  console.log(`Total plates to check: ${totalPlates.toLocaleString()}`);
  console.log(`Total batches: ${allBatches.length}`);
  console.log("");

  if (totalPlates === 0) {
    console.log("No plates matched the selected filters.");
    return;
  }

  let formFields = await refreshFormFields();
  let checked = 0;
  let found = 0;
  let errors = 0;
  let batchIndex = 0;
  let lastFormFieldRefresh = 0;

  // Simple queue with mutex-like behavior
  const getNextBatch = (): { batch: string[]; index: number } | null => {
    if (batchIndex >= allBatches.length) return null;
    const index = batchIndex++;
    const batch = allBatches[index];
    if (!batch) return null;
    return { batch, index: index + 1 };
  };

  // Process batches with concurrency control
  const processQueue = async () => {
    while (true) {
      const next = getNextBatch();
      if (!next) break;

      const { batch: currentBatch, index: batchNum } = next;

      // Refresh form fields periodically (with simple lock)
      let fieldsToUse = formFields;
      if (batchNum - lastFormFieldRefresh >= FORM_FIELD_REFRESH_INTERVAL) {
        try {
          fieldsToUse = await refreshFormFields();
          formFields = fieldsToUse;
          lastFormFieldRefresh = batchNum;
        } catch (error) {
          console.error("Failed to refresh form fields:", error);
        }
      }

      const result = await processBatchWithRetry(currentBatch, fieldsToUse);
      
      if (!result.success) {
        errors++;
      }

      // Filter out empty strings from the batch
      const actualPlates = currentBatch.filter(p => p !== "");
      const available = result.available.filter(p => actualPlates.includes(p));

      // Write results (fs.appendFileSync is thread-safe in Node.js)
      for (const p of available) {
        fs.appendFileSync(outputFile, p + "\n");
        found++;
      }

      checked += actualPlates.length;
      
      if (batchNum % 10 === 0 || batchNum === allBatches.length) {
        console.log(`Checked ${checked}/${totalPlates} (${((checked / totalPlates) * 100).toFixed(1)}%) | Available: ${found} | Errors: ${errors}`);
      }

      // Small delay to avoid overwhelming the server
      await sleep(DELAY_MS);
    }
  };

  // Start concurrent workers
  const workers = Array(CONCURRENT_REQUESTS).fill(0).map(() => processQueue());
  await Promise.all(workers);

  console.log("");
  console.log(`Done! Checked ${checked} plates, found ${found} available.`);
  console.log(`Available plates saved to ${outputFile}`);
  if (errors > 0) {
    console.log(`Warning: ${errors} errors occurred during processing.`);
  }
}

main().catch(console.error);
