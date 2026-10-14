#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const allowedTypes = new Set(["function", "feature", "visual"]);

function usage() {
  console.log(`Usage: node tools/run-scenarios.cjs --file <path> [--type feature|function|visual] [--id <id>]

Reads a JSON scenario file and prints a grouped, human-friendly checklist.
`);
}

function parseArgs(argv) {
  const opts = { file: null, type: null, id: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") {
      opts.file = argv[i + 1];
      i++;
    } else if (arg === "--type") {
      opts.type = argv[i + 1];
      i++;
    } else if (arg === "--id") {
      opts.id = argv[i + 1];
      i++;
    }
  }
  return opts;
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeType(type) {
  if (!type) return null;
  const t = String(type).toLowerCase().trim();
  if (allowedTypes.has(t)) return t;
  if (t === "functional") return "function";
  return null;
}

function validateScenario(s, idx) {
  if (!s.id) throw new Error(`Scenario at index ${idx} is missing "id"`);
  const type = normalizeType(s.type);
  if (!type) throw new Error(`Scenario "${s.id}" has invalid type "${s.type}"`);
  return {
    id: s.id,
    type,
    area: s.area || "",
    description: s.description || "",
    preconditions: ensureArray(s.preconditions),
    steps: ensureArray(s.steps),
    expected: ensureArray(s.expected),
    visualChecks: ensureArray(s.visualChecks || s.visual_checks),
    notes: s.notes || "",
  };
}

function formatList(items, label) {
  if (!items.length) return "";
  const lines = items.map((item, idx) => `    ${idx + 1}. ${item}`);
  return `  ${label}:\n${lines.join("\n")}\n`;
}

function printScenario(s) {
  const header = `- [${s.type}] ${s.id}${s.area ? ` — ${s.area}` : ""}`;
  const details = [];
  if (s.description) details.push(`  Description: ${s.description}`);
  details.push(formatList(s.preconditions, "Preconditions"));
  details.push(formatList(s.steps, "Steps"));
  details.push(formatList(s.expected, "Expected"));
  details.push(formatList(s.visualChecks, "Visual checks"));
  if (s.notes) details.push(`  Notes: ${s.notes}`);
  return [header, ...details.filter(Boolean)].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    usage();
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Scenario file not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse JSON: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(data.scenarios)) {
    console.error(`Expected "scenarios" array in ${filePath}`);
    process.exit(1);
  }

  const scenarios = data.scenarios.map(validateScenario);
  const filtered = scenarios.filter((s) => {
    const typeOk = args.type ? s.type === normalizeType(args.type) : true;
    const idOk = args.id ? s.id === args.id : true;
    return typeOk && idOk;
  });

  const byType = filtered.reduce((acc, s) => {
    acc[s.type] = acc[s.type] || [];
    acc[s.type].push(s);
    return acc;
  }, {});

  console.log(`Scenario set: ${data.title || path.basename(filePath)}`);
  if (args.type) console.log(`Filter: type=${normalizeType(args.type)}`);
  if (args.id) console.log(`Filter: id=${args.id}`);
  console.log("");

  const order = ["function", "feature", "visual"];
  let printed = false;
  for (const type of order) {
    const list = byType[type] || [];
    if (!list.length) continue;
    console.log(type.toUpperCase());
    console.log("".padEnd(type.length, "-"));
    list.forEach((s) => {
      console.log(printScenario(s));
      console.log("");
    });
    printed = true;
  }

  if (!printed) {
    console.log("No scenarios matched the current filters.");
  }
}

main();
