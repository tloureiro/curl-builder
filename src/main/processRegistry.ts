type KillFn = () => void;

const active = new Map<string, KillFn>();

export function registerProcess(id: string, kill: KillFn) {
  active.set(id, kill);
}

export function finishProcess(id: string) {
  active.delete(id);
}

export function killProcess(id: string): boolean {
  const killer = active.get(id);
  if (killer) {
    killer();
    active.delete(id);
    return true;
  }
  return false;
}
