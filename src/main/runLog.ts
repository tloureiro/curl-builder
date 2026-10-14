import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { InputError } from "../shared/validation";
import { getStoragePaths } from "./storage";

export function assertRunMetadata(content: unknown): asserts content is string {
  const line = /^(?:Run @ \d{4}-\d{2}-\d{2}T[\d:.]+Z|Method: (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)|Enabled (?:headers|cookies): \d+|Filters: jq=(?:true|false) grep=(?:true|false)|manual edits: (?:present|none)|(?:curl|jq|grep) exit: (?:null|-?\d+) stdout=\d+B stderr=\d+B|error: Run failed \(details shown in the application\))$/;
  if (typeof content !== "string" || content.length > 131072 || content.split("\n").some((value) => !line.test(value))) {
    throw new InputError("Diagnostic logs accept metadata only");
  }
}

export function writeRunLog(content: string): string {
  assertRunMetadata(content);
  const logPath = getRunLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
  const temporary = `${logPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, logPath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return logPath;
}

export function getRunLogPath(): string {
  return getStoragePaths().logPath;
}
