import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";

export interface RunProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdinText?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  errorMessage?: string;
}

export interface RunningProcess {
  promise: Promise<RunProcessResult>;
  kill: () => void;
  pid?: number;
}

export function subprocessEnvironment(source = process.env): NodeJS.ProcessEnv {
  const allowed = new Set(["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "WINDIR", "PATHEXT"]);
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase())));
}

export function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions = {}
): RunningProcess {
  let child: ChildProcessWithoutNullStreams | null = spawn(command, args, {
    cwd: options.cwd,
    env: subprocessEnvironment(options.env),
    shell: false,
  });

  let stdout = "";
  let stderr = "";
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outputBytes = 0;
  const maxOutputBytes = options.maxOutputBytes ?? 10 * 1024 * 1024;

  const promise = new Promise<RunProcessResult>((resolve) => {
    if (!child) {
      resolve({ stdout: "", stderr: "", exitCode: null, errorMessage: "Failed to spawn process" });
      return;
    }

    const finalize = (exitCode: number | null, errorMessage?: string) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, errorMessage });
    };

    if (child.stdin && options.stdinText !== undefined) {
      child.stdin.end(options.stdinText);
    }

    const collect = (chunk: Buffer, stderrStream: boolean) => {
      if (finished) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        killProcess(child);
        finalize(null, "Process output exceeded capture limit");
        return;
      }
      if (stderrStream) stderr += chunk.toString();
      else stdout += chunk.toString();
    };
    child.stdout.on("data", (chunk) => collect(chunk, false));
    child.stderr.on("data", (chunk) => collect(chunk, true));
    child.stdin.on("error", () => { /* The process exit/error owns the result (e.g. EPIPE). */ });

    child.on("error", (err) => {
      finalize(null, err.message);
    });

    child.on("close", (code) => {
      finalize(code ?? null);
    });

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!finished) {
          killProcess(child);
          finalize(null, "Process timed out");
        }
      }, options.timeoutMs);
    }
  });

  const kill = () => {
    if (!finished && child) {
      killProcess(child);
    }
  };

  return { promise, kill, pid: child?.pid ?? undefined };
}

function killProcess(child: ChildProcessWithoutNullStreams) {
  try {
    child.kill("SIGKILL");
  } catch (err) {
    // ignore
  }
}
