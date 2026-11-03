import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentClasses } from "@phoenix/content";
import * as srd from "@phoenix/rules-srd";
import { translate } from "@phoenix/shared";

/**
 * Writes docs/COVERAGE.md: what the system automates, from the rules and the content that are registered.
 * `--check` writes nothing and fails if the file is out of date, for CI.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "docs", "COVERAGE.md");

const AUTOMATION: Record<string, string> = { full: "completa", partial: "parziale", manual: "a mano" };
const SOURCE: Record<string, string> = { srd: "SRD", "srd-modified": "SRD modificata", original: "originale" };

type Meta = { automation: string; source: string };

function isMeta(value: unknown): value is Meta {
  return typeof value === "object" && value !== null && "automation" in value && "source" in value && typeof value.automation === "string" && typeof value.source === "string";
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function hasTests(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".test.ts"));
}

const lines: string[] = [
  "# Copertura",
  "",
  "File generato da `pnpm coverage:content`: non modificarlo a mano. Elenca ciò che il sistema automatizza e cosa resta al DM.",
  "",
  "## Contenuti",
  "",
  "| Tipo | Nome | ID | Fonte | Automazione | Test | Cosa risolve il DM |",
  "| --- | --- | --- | --- | --- | --- | --- |",
];

const counts = new Map<string, number>();
function count(automation: string): void {
  counts.set(automation, (counts.get(automation) ?? 0) + 1);
}

for (const { class: cls, subclasses, options } of contentClasses) {
  const tested = hasTests(join(root, "packages", "content", "src", "classes", cls.id)) ? "sì" : "no";
  const row = (kind: string, nameKey: string, id: string, source: string, automation: string, dmNoteKey?: string): void => {
    count(automation);
    const note = dmNoteKey === undefined ? "" : translate(dmNoteKey);
    lines.push(`| ${kind} | ${cell(translate(nameKey))} | \`${id}\` | ${SOURCE[source] ?? source} | ${AUTOMATION[automation] ?? automation} | ${tested} | ${cell(note)} |`);
  };
  row("Classe", cls.nameKey, cls.id, cls.source, cls.automation);
  for (const f of cls.features) row("Privilegio", f.nameKey, `${cls.id}/${f.id}`, f.source, f.automation, f.dmNoteKey);
  for (const o of options) row("Opzione", o.nameKey, `${cls.id}/${o.id}`, o.source, o.automation, o.dmNoteKey);
  for (const sub of subclasses) {
    row("Sottoclasse", sub.nameKey, `${cls.id}/${sub.id}`, sub.source, sub.automation);
    for (const f of sub.features) row("Privilegio", f.nameKey, `${cls.id}/${sub.id}/${f.id}`, f.source, f.automation, f.dmNoteKey);
  }
}

lines.push("", `Totale: ${String(counts.get("full") ?? 0)} complete, ${String(counts.get("partial") ?? 0)} parziali, ${String(counts.get("manual") ?? 0)} a mano.`);

lines.push("", "## Regole", "", "| Modulo | Fonte | Automazione |", "| --- | --- | --- |");
const rules: [string, Meta][] = [];
for (const [name, value] of Object.entries(srd)) {
  if (!name.endsWith("Meta")) continue;
  if (isMeta(value)) rules.push([name, value]);
  else if (typeof value === "object") {
    for (const [inner, innerValue] of Object.entries(value)) if (isMeta(innerValue)) rules.push([`${name}.${inner}`, innerValue]);
  }
}
for (const [name, meta] of rules.sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`| \`${name}\` | ${SOURCE[meta.source] ?? meta.source} | ${AUTOMATION[meta.automation] ?? meta.automation} |`);
}
lines.push("");

const output = lines.join("\n");
if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== output) {
    console.error("docs/COVERAGE.md non è aggiornato: esegui `pnpm coverage:content`.");
    process.exit(1);
  }
  console.log("docs/COVERAGE.md è aggiornato.");
} else {
  writeFileSync(target, output);
  console.log(`Scritto ${target}`);
}
