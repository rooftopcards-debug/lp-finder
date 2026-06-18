export type ParsedArgs = Record<string, string | boolean>;

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw?.startsWith("--")) continue;

    const withoutPrefix = raw.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");

    if (equalsIndex !== -1) {
      args[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[withoutPrefix] = next;
      i++;
      continue;
    }

    args[withoutPrefix] = true;
  }

  return args;
}

export function readBoolean(value: string | boolean | undefined, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

export function readNumber(value: string | boolean | undefined, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
