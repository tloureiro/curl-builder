import { GrepExecutionRequest } from "./types";

export function buildGrepArgs(req: GrepExecutionRequest): string[] {
  const useRg = req.useRipgrep ?? false;
  const args: string[] = [];

  // line numbers
  args.push(useRg ? "--line-number" : "-n");

  const options = req.options || {};
  if (options.caseInsensitive) args.push("-i");
  if (options.wordMatch) args.push("-w");
  if (options.fixedStrings) args.push("-F");
  if (options.invertMatch) args.push("-v");

  if (req.flags?.length) {
    args.push(...req.flags.filter(Boolean));
  }

  const patterns = normalizePatterns(req);
  if (patterns.length === 0) {
    return args;
  }

  for (const p of patterns) {
    args.push("-e", p);
  }

  return args;
}

function normalizePatterns(req: GrepExecutionRequest): string[] {
  if (req.patterns && req.patterns.length > 0) {
    return req.patterns.filter((p) => p.trim().length > 0);
  }
  if (req.pattern) {
    return [req.pattern];
  }
  return [];
}
