// grepPath is a legacy setting for either engine. Never reuse a configured
// binary for the other engine: their flags and exit behavior differ.
export function pickGrepBinary(configPath: string | undefined, useRg: boolean): string {
  const expected = useRg ? "rg" : "grep";
  const basename = configPath?.split(/[\\/]/).pop()?.replace(/\.exe$/i, "");
  return basename === expected ? configPath! : expected;
}
