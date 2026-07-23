import https from "node:https";
import * as cheerio from "cheerio";

const BASE_URL = "https://services.flhsmv.gov/mvcheckpersonalplate/";
const MAX_BATCH_SIZE = 5;

type FormFields = {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
};

export type PlateOptions = {
  length: number;
  exactLength?: boolean;
  includeNumbers?: boolean;
  onlyNumbers?: boolean;
  coolNumberPatternsOnly?: boolean;
  sameCharacterOnly?: boolean;
  includeHyphens?: boolean;
};

export type NormalizedPlateOptions = {
  length: number;
  exactLength: boolean;
  includeNumbers: boolean;
  onlyNumbers: boolean;
  coolNumberPatternsOnly: boolean;
  sameCharacterOnly: boolean;
  includeHyphens: boolean;
};

export type ScanProgress = {
  checked: number;
  total: number;
  found: number;
  errors: number;
  completedBatches: number;
  totalBatches: number;
};

export type ScanSettings = {
  batchSize?: number;
  concurrency?: number;
  delayMs?: number;
  formFieldRefreshInterval?: number;
  onProgress?: (progress: ScanProgress) => void;
};

export type ScanResult = {
  options: NormalizedPlateOptions;
  checked: number;
  available: string[];
  errors: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function fetchPage(method: "GET" | "POST", body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bodyBuffer = body ? Buffer.from(body) : undefined;
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html",
    };

    if (bodyBuffer) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = bodyBuffer.byteLength.toString();
    }

    const req = https.request(BASE_URL, { method, headers }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 400) {
          reject(new Error(`Florida plate checker returned HTTP ${statusCode}`));
          return;
        }
        resolve(data);
      });
    });

    req.on("error", reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

function getRequiredInputValue($: cheerio.CheerioAPI, selector: string) {
  const value = $(selector).val();
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Failed to extract ${selector}`);
  }
  return value;
}

function extractFormFields(html: string): FormFields {
  const $ = cheerio.load(html);

  return {
    viewState: getRequiredInputValue($, "#__VIEWSTATE"),
    viewStateGenerator: getRequiredInputValue($, "#__VIEWSTATEGENERATOR"),
    eventValidation: getRequiredInputValue($, "#__EVENTVALIDATION"),
  };
}

function buildFormData(plates: string[], f: FormFields, batchSize: number): string {
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

  for (let i = 0; i < batchSize; i++) {
    const field = fields[i];
    if (field) params.append(field, plates[i] ?? "");
  }

  params.append("ctl00$MainContent$btnSubmit", "Submit");
  return params.toString();
}

export function parseAvailableResponse(html: string, plates: string[]): string[] {
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
    if (!plate) return;

    const label = labels[i];
    if (!label) return;

    const output = $(`#${label}`);
    if (output.length === 0) {
      throw new Error(`Florida plate checker response is missing result row ${i + 1}.`);
    }

    const text = output.text().replace(/\s+/g, " ").trim().toUpperCase();
    if (text === "AVAILABLE") {
      available.push(plate);
    } else if (text !== "NOT AVAILABLE") {
      throw new Error(`Florida plate checker returned an unknown result for row ${i + 1}: ${text || "empty"}`);
    }
  });

  return available;
}

export function normalizePlateOptions(options: PlateOptions): NormalizedPlateOptions {
  if (!Number.isFinite(options.length)) {
    throw new Error("Plate length must be a number from 1 to 7.");
  }

  const length = clamp(Math.trunc(options.length), 1, 7);
  const onlyNumbers = options.onlyNumbers ?? false;

  return {
    length,
    exactLength: options.exactLength ?? false,
    includeNumbers: onlyNumbers ? true : options.includeNumbers ?? false,
    onlyNumbers,
    coolNumberPatternsOnly: options.coolNumberPatternsOnly ?? false,
    sameCharacterOnly: options.sameCharacterOnly ?? false,
    includeHyphens: options.includeHyphens ?? false,
  };
}

function getCharacters(options: NormalizedPlateOptions) {
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode("A".charCodeAt(0) + i));
  const numbers = Array.from({ length: 10 }, (_, i) => i.toString());

  if (options.onlyNumbers) return numbers;
  if (options.includeNumbers) return [...letters, ...numbers];
  return letters;
}

function* generateCombinations(chars: string[], length: number, prefix = ""): Generator<string> {
  if (length === 0) {
    yield prefix;
    return;
  }

  for (const char of chars) {
    yield* generateCombinations(chars, length - 1, prefix + char);
  }
}

function* generateHyphenVariants(value: string): Generator<string> {
  for (let pos = 0; pos <= value.length; pos++) {
    yield value.slice(0, pos) + "-" + value.slice(pos);
  }

  if (value.length < 3) return;

  for (let first = 1; first < value.length; first++) {
    for (let second = first + 1; second < value.length; second++) {
      yield value.slice(0, first) + "-" + value.slice(first, second) + "-" + value.slice(second);
    }
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

  return /^(\d)\1+$/.test(digits) || /^[1-9]0+$/.test(digits) || isCanonicalOrderedDigits(digits);
}

function isSameCharacterPlate(plate: string): boolean {
  const chars = plate.replace(/-/g, "");
  if (chars.length === 0) return false;
  return chars.split("").every(ch => ch === chars[0]);
}

function* generateCoolNumberPatterns(lengths: number[]): Generator<string> {
  const plates = new Set<string>();

  for (const length of lengths) {
    if (length === 1) {
      for (let digit = 0; digit <= 9; digit++) plates.add(digit.toString());
      continue;
    }

    for (let digit = 0; digit <= 9; digit++) {
      plates.add(digit.toString().repeat(length));
    }

    for (let digit = 1; digit <= 9; digit++) {
      plates.add(digit.toString() + "0".repeat(length - 1));
    }

    if (length <= 10) {
      const ascending = Array.from({ length }, (_, i) => i.toString()).join("");
      plates.add(ascending);
      plates.add(ascending.split("").reverse().join(""));
    }
  }

  yield* plates;
}

function* generateSameCharacterPlates(chars: string[], lengths: number[]): Generator<string> {
  for (const length of lengths) {
    for (const char of chars) {
      yield char.repeat(length);
    }
  }
}

function* withOptionalHyphens(plate: string, options: NormalizedPlateOptions): Generator<string> {
  yield plate;

  if (!options.includeHyphens) return;

  for (const hyphenated of generateHyphenVariants(plate)) {
    if (options.sameCharacterOnly && !isSameCharacterPlate(hyphenated)) continue;
    if (options.coolNumberPatternsOnly && !isCoolNumberPattern(hyphenated)) continue;
    yield hyphenated;
  }
}

export function* generatePlates(options: PlateOptions): Generator<string> {
  const normalized = normalizePlateOptions(options);
  const chars = getCharacters(normalized);
  const lengths = normalized.exactLength
    ? [normalized.length]
    : Array.from({ length: normalized.length }, (_, i) => i + 1);

  if (normalized.coolNumberPatternsOnly) {
    for (const plate of generateCoolNumberPatterns(lengths)) {
      if (normalized.sameCharacterOnly && !isSameCharacterPlate(plate)) continue;
      yield* withOptionalHyphens(plate, normalized);
    }
    return;
  }

  if (normalized.sameCharacterOnly) {
    for (const plate of generateSameCharacterPlates(chars, lengths)) {
      yield* withOptionalHyphens(plate, normalized);
    }
    return;
  }

  for (const length of lengths) {
    for (const plate of generateCombinations(chars, length)) {
      yield* withOptionalHyphens(plate, normalized);
    }
  }
}

export function buildCandidatePlates(options: PlateOptions): string[] {
  return Array.from(generatePlates(options));
}

function makeBatches(plates: string[], batchSize: number): string[][] {
  const batches: string[][] = [];

  for (let i = 0; i < plates.length; i += batchSize) {
    const batch = plates.slice(i, i + batchSize);
    while (batch.length < batchSize) batch.push("");
    batches.push(batch);
  }

  return batches;
}

async function refreshFormFields(): Promise<FormFields> {
  return extractFormFields(await fetchPage("GET"));
}

async function processBatch(batch: string[], formFields: FormFields, batchSize: number): Promise<string[]> {
  const body = buildFormData(batch, formFields, batchSize);
  const html = await fetchPage("POST", body);
  return parseAvailableResponse(html, batch);
}

async function processBatchWithRetry(
  batch: string[],
  formFields: FormFields,
  batchSize: number,
  delayMs: number,
  retries = 2
): Promise<{ available: string[]; success: boolean }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return {
        available: await processBatch(batch, formFields, batchSize),
        success: true,
      };
    } catch {
      if (attempt === retries) return { available: [], success: false };
      await sleep(delayMs * 2);
    }
  }

  return { available: [], success: false };
}

export async function scanPlates(options: PlateOptions, settings: ScanSettings = {}): Promise<ScanResult> {
  const normalized = normalizePlateOptions(options);
  const batchSize = clamp(Math.trunc(settings.batchSize ?? MAX_BATCH_SIZE), 1, MAX_BATCH_SIZE);
  const concurrency = clamp(Math.trunc(settings.concurrency ?? 2), 1, 10);
  const delayMs = Math.max(0, Math.trunc(settings.delayMs ?? 250));
  const formFieldRefreshInterval = Math.max(1, Math.trunc(settings.formFieldRefreshInterval ?? 100));
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const candidates = buildCandidatePlates(normalized);
  const batches = makeBatches(candidates, batchSize);

  if (candidates.length === 0) {
    const finished = Date.now();
    return {
      options: normalized,
      checked: 0,
      available: [],
      errors: 0,
      startedAt,
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - started,
    };
  }

  let formFields = await refreshFormFields();
  let lastFormFieldRefresh = 0;
  let batchIndex = 0;
  let checked = 0;
  let errors = 0;
  let completedBatches = 0;
  const available: string[] = [];

  const getNextBatch = (): { batch: string[]; number: number } | null => {
    if (batchIndex >= batches.length) return null;
    const index = batchIndex++;
    const batch = batches[index];
    if (!batch) return null;
    return { batch, number: index + 1 };
  };

  const reportProgress = () => {
    settings.onProgress?.({
      checked,
      total: candidates.length,
      found: available.length,
      errors,
      completedBatches,
      totalBatches: batches.length,
    });
  };

  const processQueue = async () => {
    while (true) {
      const next = getNextBatch();
      if (!next) break;

      let fieldsToUse = formFields;
      if (next.number - lastFormFieldRefresh >= formFieldRefreshInterval) {
        try {
          fieldsToUse = await refreshFormFields();
          formFields = fieldsToUse;
          lastFormFieldRefresh = next.number;
        } catch {
          // Reuse the previous fields and let the batch retry path handle failures.
        }
      }

      const result = await processBatchWithRetry(next.batch, fieldsToUse, batchSize, delayMs);
      if (!result.success) errors++;

      const actualPlates = next.batch.filter(Boolean);
      available.push(...result.available.filter(plate => actualPlates.includes(plate)));
      checked += actualPlates.length;
      completedBatches++;
      reportProgress();

      if (delayMs > 0) await sleep(delayMs);
    }
  };

  const workerCount = Math.min(concurrency, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => processQueue()));

  const finished = Date.now();
  return {
    options: normalized,
    checked,
    available: [...new Set(available)].sort(),
    errors,
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
  };
}

export function getPlateCheckKey(options: PlateOptions) {
  const normalized = normalizePlateOptions(options);
  const charset = normalized.onlyNumbers
    ? "numbers"
    : normalized.includeNumbers
      ? "letters-numbers"
      : "letters";

  return [
    normalized.exactLength ? "exact" : "up-to",
    `len-${normalized.length}`,
    charset,
    normalized.includeHyphens ? "hyphens" : "no-hyphens",
    normalized.sameCharacterOnly ? "same-character" : "any-pattern",
    normalized.coolNumberPatternsOnly ? "cool-numbers" : "all-numbers",
  ].join("_");
}

export function describePlateOptions(options: PlateOptions) {
  const normalized = normalizePlateOptions(options);
  const lengthText = normalized.exactLength ? `${normalized.length}` : `up to ${normalized.length}`;
  const charset = normalized.onlyNumbers
    ? "numbers"
    : normalized.includeNumbers
      ? "letters and numbers"
      : "letters";

  const filters = [
    normalized.includeHyphens ? "hyphens" : "no hyphens",
    normalized.sameCharacterOnly ? "same character only" : "",
    normalized.coolNumberPatternsOnly ? "cool number patterns" : "",
  ].filter(Boolean);

  return `${lengthText} ${charset}${filters.length ? ` (${filters.join(", ")})` : ""}`;
}
