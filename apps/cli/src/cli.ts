import { readFile } from "node:fs/promises";
import { stdin, stderr, stdout } from "node:process";
import { COMMANDS, WorkspaceError, findCommand, type CommandDefinition } from "@giraffle/headless";
import { markdownToBlocks } from "@giraffle/domain";
import { desktopStatus, openDesktopInstaller } from "./transport.js";
import { executeRemote } from "./transport.js";

const VERSION = "0.13.0";

interface Globals {
  json: boolean;
  help: boolean;
  version: boolean;
  passphraseFile?: string;
  input?: string;
  rest: string[];
}

async function main(): Promise<void> {
  const globals = parseGlobals(process.argv.slice(2));
  if (globals.version) return print(`${VERSION}\n`);
  if (globals.help && globals.rest.length === 0) return printHelp();
  if (globals.rest.length === 0) return printHelp();
  if (globals.rest[0] === "commands") return printCommands(globals.json);
  if (globals.rest[0] === "desktop") return handleDesktop(globals.rest.slice(1), globals.json);

  const definition = findCommand(globals.rest[0] ?? "", globals.rest[1] ?? "");
  if (!definition) throw new WorkspaceError("INVALID_INPUT", `Unknown command: ${globals.rest.slice(0, 2).join(" ")}`);
  if (globals.help) return printCommandHelp(definition);

  const input = await parseCommandInput(definition, globals.rest.slice(2), globals.input);
  const credential = await optionalPassphrase(globals.passphraseFile);
  const data = await executeRemote(definition.name, input, credential);
  printResult(definition, data, globals.json);
}

function parseGlobals(argv: string[]): Globals {
  const rest: string[] = [];
  let json = false;
  let help = false;
  let version = false;
  let passphraseFile = process.env.GIRAFFLE_PASSPHRASE_FILE;
  let input: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] ?? "";
    if (argument === "--json") json = true;
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument === "--version" || argument === "-v") version = true;
    else if (argument === "--passphrase-file") passphraseFile = requiredValue(argv, ++index, "--passphrase-file");
    else if (argument.startsWith("--passphrase-file=")) passphraseFile = argument.slice("--passphrase-file=".length);
    else if (argument === "--input") input = requiredValue(argv, ++index, "--input");
    else if (argument.startsWith("--input=")) input = argument.slice("--input=".length);
    else rest.push(argument);
  }
  return { json, help, version, passphraseFile, input, rest };
}

async function parseCommandInput(definition: CommandDefinition, argv: string[], rawInput?: string): Promise<Record<string, unknown>> {
  const input = rawInput ? await readJsonObject(rawInput) : {};
  const positionals: string[] = [];
  let markdown: string | undefined;
  let specSource: string | undefined;
  let useStdin = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] ?? "";
    if (argument === "--stdin") { useStdin = true; continue; }
    if (argument === "--markdown") { markdown = requiredValue(argv, ++index, "--markdown"); continue; }
    if (argument.startsWith("--markdown=")) { markdown = argument.slice("--markdown=".length); continue; }
    if (argument === "--spec") { specSource = requiredValue(argv, ++index, "--spec"); continue; }
    if (argument.startsWith("--spec=")) { specSource = argument.slice("--spec=".length); continue; }
    if (!argument.startsWith("--")) { positionals.push(argument); continue; }
    const equal = argument.indexOf("=");
    const rawName = argument.slice(2, equal >= 0 ? equal : undefined);
    if (rawName.startsWith("no-")) { input[toCamel(rawName.slice(3))] = false; continue; }
    const name = toCamel(rawName);
    const next = equal >= 0 ? argument.slice(equal + 1) : argv[index + 1];
    if (equal < 0 && (next === undefined || next.startsWith("--"))) { input[name] = true; continue; }
    if (equal < 0) index++;
    input[name] = parseOptionValue(name, next ?? "");
  }
  if (positionals.length > definition.positionals.length) throw new WorkspaceError("INVALID_INPUT", `Too many arguments. Usage: giraffle ${definition.usage}`);
  definition.positionals.forEach((name, index) => { const value = positionals[index]; if (value !== undefined) input[name] = nullablePositional(name, value); });
  if (useStdin) {
    const content = await readStandardInput();
    if (definition.name === "pages_capture") input.title = content.trimEnd();
    else if (definition.name === "pages_create" || definition.name === "pages_append") markdown = content;
    else if (definition.name === "canvas_apply") specSource = content;
    else throw new WorkspaceError("INVALID_INPUT", "--stdin is supported by page create, append, capture, and canvas apply");
  }
  if (markdown !== undefined) {
    if (definition.name !== "pages_create" && definition.name !== "pages_append") throw new WorkspaceError("INVALID_INPUT", "--markdown is supported by page create and page append");
    input.blocks = markdownToBlocks(markdown).content;
  }
  if (specSource !== undefined) {
    if (definition.name !== "canvas_apply") throw new WorkspaceError("INVALID_INPUT", "--spec is supported by canvas apply");
    input.spec = await readJsonValue(specSource);
  }
  if (typeof input.blocks === "string") input.blocks = await readJsonValue(input.blocks);
  const shape = (definition.inputSchema as unknown as { shape?: Record<string, unknown> }).shape;
  if (shape) {
    const unknown = Object.keys(input).filter((name) => !(name in shape));
    if (unknown.length) throw new WorkspaceError("INVALID_INPUT", `Unknown option: --${unknown.map(toKebab).join(", --")}`);
  }
  return input;
}

async function optionalPassphrase(passphraseFile?: string): Promise<string | undefined> {
  if (passphraseFile) return (await readFile(passphraseFile, "utf8")).replace(/[\r\n]+$/, "");
  if (process.env.GIRAFFLE_PASSPHRASE !== undefined) return process.env.GIRAFFLE_PASSPHRASE;
  return undefined;
}

async function readJsonObject(source: string): Promise<Record<string, unknown>> { const value = await readJsonValue(source); if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("INVALID_INPUT", "--input must contain a JSON object"); return value as Record<string, unknown>; }
async function readJsonValue(source: string): Promise<unknown> { const text = source === "-" ? await readStandardInput() : source.startsWith("@") ? await readFile(source.slice(1), "utf8") : source; try { return JSON.parse(text); } catch { throw new WorkspaceError("INVALID_INPUT", "Expected valid JSON input"); } }
const numberOptions = new Set(["limit", "durationMinutes"]);
const booleanOptions = new Set(["includeArchived", "isPinned", "isArchived", "includeDone", "includeElements", "isDefault"]);
const nullableOptions = new Set(["parentId", "icon", "scheduledAt", "durationMinutes", "priority", "description", "afterPageId", "categoryId", "color", "stateIdOnEnter"]);
function parseOptionValue(name: string, value: string): unknown { if (booleanOptions.has(name) && value === "true") return true; if (booleanOptions.has(name) && value === "false") return false; if (nullableOptions.has(name) && value === "null") return null; if (numberOptions.has(name) && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value); if (name === "blocks" && value.startsWith("[") && value.endsWith("]")) { try { return JSON.parse(value); } catch { return value; } } return value; }
function nullablePositional(name: string, value: string): string | null { return value === "null" && (name.endsWith("Id") || name === "priority") ? null : value; }
async function readStandardInput(): Promise<string> { let content = ""; stdin.setEncoding("utf8"); for await (const chunk of stdin) content += chunk; return content; }
function printResult(definition: CommandDefinition, data: unknown, json: boolean): void { if (!json && definition.name === "pages_export" && isRecord(data) && typeof data.markdown === "string") return print(`${data.markdown}${data.markdown.endsWith("\n") ? "" : "\n"}`); printData(data, json); }
function printData(data: unknown, json: boolean): void { print(`${JSON.stringify(json ? { ok: true, data } : data, null, json ? 0 : 2)}\n`); }
function printHelp(): void { print(`Giraffle ${VERSION} — control the same vault used by the desktop UI\n\nUsage:\n  giraffle <group> <command> [arguments] [options]\n  giraffle commands\n  giraffle desktop install\n\nGlobal options:\n  --passphrase-file PATH   Unlock the desktop vault when needed\n  --input JSON|@FILE|-     Supply the command input object\n  --json                   Stable machine-readable output\n  --help                   Show help\n\nDesktop:\n  giraffle desktop install   Open the matching signed desktop release download\n  giraffle desktop status    Check whether Giraffle.app is installed\n\nThe desktop runtime starts invisibly when needed. CLI and UI always use the same vault.\n`); }
async function handleDesktop(argv: string[], json: boolean): Promise<void> {
  const command = argv[0];
  if (command === "status") return printData(await desktopStatus(), json);
  if (command === "install") return printData(await openDesktopInstaller(VERSION), json);
  throw new WorkspaceError("INVALID_INPUT", "Usage: giraffle desktop <install|status>");
}
function printCommands(json: boolean): void { const commands = COMMANDS.map(({ name, path, summary, mutates, usage }) => ({ name, command: path.join(" "), summary, mutates, usage })); if (json) return printData(commands, true); const width = Math.max(...commands.map((entry) => entry.command.length)); print(`${commands.map((entry) => `  ${entry.command.padEnd(width)}  ${entry.summary}`).join("\n")}\n`); }
function printCommandHelp(definition: CommandDefinition): void { print(`Usage: giraffle ${definition.usage}\n\n${definition.summary}\n\nUse --input JSON for structured input and --json for machine-readable output.\n`); }
function requiredValue(argv: string[], index: number, option: string): string { const value = argv[index]; if (!value || value.startsWith("--")) throw new WorkspaceError("INVALID_INPUT", `${option} requires a value`); return value; }
function toCamel(value: string): string { return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()); }
function toKebab(value: string): string { return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function print(value: string): void { stdout.write(value); }

main().catch((cause: unknown) => {
  const json = process.argv.includes("--json");
  const error = cause instanceof WorkspaceError ? { code: cause.code, message: cause.message } : { code: "INTERNAL_ERROR", message: cause instanceof Error ? cause.message : "Unexpected failure" };
  stderr.write(`${JSON.stringify(json ? { ok: false, error } : error, null, json ? 0 : 2)}\n`);
  process.exitCode = cause instanceof WorkspaceError && cause.code === "INVALID_INPUT" ? 2 : cause instanceof WorkspaceError && cause.code === "NOT_FOUND" ? 3 : 1;
});
