import path from "path";
import readline from "readline";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const DEFAULT_TIMEOUT_MS = Number(process.env.DROWSINESS_INFERENCE_TIMEOUT_MS || 12000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "../..");
const APP_ROOT = path.resolve(SERVER_ROOT, "..");

class DrowsinessBridge {
  constructor() {
    this.proc = null;
    this.rl = null;
    this.pending = new Map();
    this.requestCounter = 0;
    this.ready = false;
  }

  _nextId() {
    this.requestCounter += 1;
    return `req_${Date.now()}_${this.requestCounter}`;
  }

  _hasUsablePython(executable, args = ["--version"]) {
    try {
      const result = spawnSync(executable, args, {
        stdio: "ignore",
        shell: false,
      });

      return result?.status === 0;
    } catch {
      return false;
    }
  }

  _resolvePythonCommand() {
    if (process.env.DROWSINESS_PYTHON_EXEC) {
      return {
        executable: process.env.DROWSINESS_PYTHON_EXEC,
        prefixArgs: [],
      };
    }

    const isWindows = process.platform === "win32";

    if (isWindows) {
      if (this._hasUsablePython("py", ["-3", "--version"])) {
        return { executable: "py", prefixArgs: ["-3"] };
      }

      if (this._hasUsablePython("python")) {
        return { executable: "python", prefixArgs: [] };
      }

      if (this._hasUsablePython("python3")) {
        return { executable: "python3", prefixArgs: [] };
      }

      throw new Error(
        "Python runtime not found. Install Python and ensure either 'py -3' or 'python' is available in PATH, or set DROWSINESS_PYTHON_EXEC.",
      );
    }

    if (this._hasUsablePython("python3")) {
      return { executable: "python3", prefixArgs: [] };
    }

    if (this._hasUsablePython("python")) {
      return { executable: "python", prefixArgs: [] };
    }

    throw new Error(
      "Python runtime not found. Install Python 3 and ensure 'python3' is in PATH, or set DROWSINESS_PYTHON_EXEC.",
    );
  }

  _resolveWorkerPath() {
    return path.resolve(APP_ROOT, "driver_safety_system", "app", "inference_worker.py");
  }

  _cleanupProcess() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.proc) {
      this.proc.removeAllListeners();
      this.proc = null;
    }

    this.ready = false;

    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Drowsiness inference worker stopped"));
    }
    this.pending.clear();
  }

  async ensureStarted() {
    if (this.proc && this.ready) {
      return;
    }

    await new Promise((resolve, reject) => {
      const { executable, prefixArgs } = this._resolvePythonCommand();
      const workerPath = this._resolveWorkerPath();

      const proc = spawn(executable, [...prefixArgs, workerPath], {
        cwd: APP_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stderrBuffer = [];

      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderrBuffer.push(text);
        if (stderrBuffer.length > 20) {
          stderrBuffer.shift();
        }
      });

      proc.on("error", (error) => {
        reject(new Error(`Failed to start drowsiness worker: ${error.message}`));
      });

      proc.on("exit", (code) => {
        const summary = stderrBuffer.join("").trim();
        const reason = summary ? `\n${summary}` : "";

        this._cleanupProcess();
        console.error(`Drowsiness worker exited with code ${code}.${reason}`);
      });

      this.proc = proc;
      this.rl = readline.createInterface({ input: proc.stdout });

      this.rl.on("line", (line) => {
        let payload;
        try {
          payload = JSON.parse(line);
        } catch {
          return;
        }

        const requestId = payload?.id;
        if (!requestId || !this.pending.has(requestId)) {
          return;
        }

        const pending = this.pending.get(requestId);
        this.pending.delete(requestId);
        clearTimeout(pending.timeout);

        if (payload.ok) {
          pending.resolve(payload.result);
        } else {
          pending.reject(new Error(payload.error || "Inference worker error"));
        }
      });

      this.ready = true;
      resolve();
    });
  }

  async request(message, timeoutMs = DEFAULT_TIMEOUT_MS) {
    await this.ensureStarted();

    return new Promise((resolve, reject) => {
      const id = this._nextId();
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Inference request timed out"));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });

      try {
        this.proc.stdin.write(`${JSON.stringify({ id, ...message })}\n`);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(new Error(`Failed to send inference request: ${error.message}`));
      }
    });
  }

  async reset(sessionKey) {
    return this.request({ type: "reset", sessionKey }, 5000);
  }

  async analyze({ frameDataUrl, sessionKey, reset = false }) {
    return this.request({
      type: "analyze",
      frame: frameDataUrl,
      sessionKey,
      reset,
    });
  }

  async stop() {
    if (!this.proc) {
      return;
    }

    try {
      await this.request({ type: "shutdown" }, 3000);
    } catch {
      // Ignore timeout during shutdown.
    }

    if (this.proc) {
      this.proc.kill("SIGTERM");
    }
  }
}

const bridge = new DrowsinessBridge();

export const analyzeDrowsinessFrame = async ({ frameDataUrl, sessionKey, reset = false }) =>
  bridge.analyze({ frameDataUrl, sessionKey, reset });

export const resetDrowsinessSession = async (sessionKey) => bridge.reset(sessionKey);

export const startDrowsinessBridge = async () => bridge.ensureStarted();

export const stopDrowsinessBridge = async () => bridge.stop();
