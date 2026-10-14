import { ConcreteRequest, RequestTemplate } from "./types";
import { generateId } from "./util";

export const VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractVars(input: string): string[] {
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = VAR_REGEX.exec(input)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

export function substituteVars(input: string, vars: Record<string, string>): string {
  return input.replace(VAR_REGEX, (_match, varName: string) => vars[varName] ?? "");
}

// Older templates omit optional request settings and still load with defaults.
export function requestFromTemplate(template: RequestTemplate): ConcreteRequest {
  const { id, name, description, variablesMeta, urlTemplate, headersTemplate, bodyTemplate, ...settings } = template;
  return structuredClone({ ...settings, id: generateId(), templateId: id,
    url: urlTemplate, headers: headersTemplate, body: bodyTemplate, resolvedVariables: {} });
}

export function templateFromRequest(request: ConcreteRequest, name: string): RequestTemplate {
  const { id, templateId, resolvedVariables, globalOptionIds, url, headers, body, ...settings } = request;
  return structuredClone({ ...settings, id: generateId(), name, urlTemplate: url,
    headersTemplate: headers, bodyTemplate: body, description: "Saved from builder", variablesMeta: [] });
}
