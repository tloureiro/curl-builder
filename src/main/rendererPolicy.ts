import path from "node:path";
import { pathToFileURL } from "node:url";

export function rendererURL(indexPath: string, devURL?: string): string {
  if (devURL !== undefined && devURL !== "http://127.0.0.1:5173" && devURL !== "http://127.0.0.1:5173/") {
    throw new Error("Development renderer must use the configured loopback server");
  }
  return devURL ? new URL(devURL).href : pathToFileURL(path.resolve(indexPath)).href;
}
export function isRendererURL(candidate: string, expected: string): boolean {
  try {
    const url = new URL(candidate); url.hash = "";
    return url.href === expected;
  } catch { return false; }
}
