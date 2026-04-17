import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultScriptPath = path.resolve(__dirname, "../../python/face_auth_app.py");
const scriptPath = process.env.FACE_SCRIPT_PATH || defaultScriptPath;
const inAppMlScriptPath =
  process.env.FACE_INAPP_ML_SCRIPT_PATH || path.resolve(__dirname, "../../python/face_inapp_ml.py");

const commandExists = (command, args = ["--version"]) => {
  try {
    const probe = spawnSync(command, args, {
      windowsHide: true,
      stdio: "ignore",
      timeout: 2000,
      shell: false,
    });
    return !probe.error;
  } catch {
    return false;
  }
};

const getPythonCommandConfig = () => {
  const custom = process.env.FACE_PYTHON_CMD?.trim();
  if (custom) {
    return {
      command: custom,
      preArgs: [],
    };
  }

  if (process.platform === "win32") {
    if (commandExists("py", ["-3", "--version"])) {
      return {
        command: "py",
        preArgs: ["-3"],
      };
    }
    if (commandExists("python", ["--version"])) {
      return {
        command: "python",
        preArgs: [],
      };
    }
    return {
      command: "py",
      preArgs: ["-3"],
    };
  }

  if (commandExists("python3", ["--version"])) {
    return {
      command: "python3",
      preArgs: [],
    };
  }
  if (commandExists("python", ["--version"])) {
    return {
      command: "python",
      preArgs: [],
    };
  }

  return {
    command: "python3",
    preArgs: [],
  };
};

const launchFaceFlow = (args = []) => {
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Face script not found at ${scriptPath}`);
  }

  const pythonConfig = getPythonCommandConfig();
  const registerTimeout = process.env.FACE_REGISTER_TIMEOUT_SECONDS || process.env.REGISTER_TIMEOUT_SECONDS || "420";
  const qualityAbortTimeout = process.env.FACE_QUALITY_ABORT_SECONDS || process.env.QUALITY_ABORT_SECONDS || "90";
  const stageNoProgressTimeout =
    process.env.FACE_STAGE_NO_PROGRESS_TIMEOUT_SECONDS || process.env.STAGE_NO_PROGRESS_TIMEOUT_SECONDS || "120";

  const child = spawn(pythonConfig.command, [...pythonConfig.preArgs, scriptPath, ...args], {
    cwd: path.dirname(scriptPath),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false,
    env: {
      ...process.env,
      REGISTER_TIMEOUT_SECONDS: String(registerTimeout),
      QUALITY_ABORT_SECONDS: String(qualityAbortTimeout),
      STAGE_NO_PROGRESS_TIMEOUT_SECONDS: String(stageNoProgressTimeout),
    },
  });

  child.on("error", (error) => {
    console.error("Failed to spawn face process:", error);
  });

  child.unref();
  return child.pid;
};

const runInAppMl = ({ mode, credential, payload }) => {
  if (!fs.existsSync(inAppMlScriptPath)) {
    throw new Error(`In-app face ML script not found at ${inAppMlScriptPath}`);
  }

  const pythonConfig = getPythonCommandConfig();
  const tempPath = path.join(os.tmpdir(), `saferide-face-${randomUUID()}.json`);

  fs.writeFileSync(tempPath, JSON.stringify(payload), "utf-8");

  try {
    const processResult = spawnSync(
      pythonConfig.command,
      [...pythonConfig.preArgs, inAppMlScriptPath, "--mode", mode, "--credential", credential, "--input", tempPath],
      {
        cwd: path.dirname(inAppMlScriptPath),
        windowsHide: true,
        shell: false,
        timeout: 120000,
        encoding: "utf-8",
        env: {
          ...process.env,
          FACE_VERIFY_THRESHOLD: process.env.FACE_VERIFY_THRESHOLD || "0.72",
        },
      }
    );

    if (processResult.error) {
      throw processResult.error;
    }

    const stdout = (processResult.stdout || "").trim();
    const stderr = (processResult.stderr || "").trim();

    const lastJsonLine = (stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .pop();

    if (processResult.status !== 0) {
      if (lastJsonLine) {
        let parsedError = null;
        try {
          parsedError = JSON.parse(lastJsonLine);
        } catch {
          parsedError = null;
        }
        if (parsedError?.message) {
          throw new Error(parsedError.message);
        }
      }
      throw new Error(stderr || "In-app ML process failed");
    }

    const parsed = JSON.parse(lastJsonLine || "{}");
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid ML response");
    }

    return parsed;
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore temp cleanup failures.
    }
  }
};

router.get("/status", (req, res) => {
  const pythonConfig = getPythonCommandConfig();
  res.json({
    success: true,
    pythonCmd: pythonConfig.command,
    pythonPreArgs: pythonConfig.preArgs,
    registerTimeoutSeconds:
      process.env.FACE_REGISTER_TIMEOUT_SECONDS || process.env.REGISTER_TIMEOUT_SECONDS || "420",
    platform: process.platform,
    scriptPath,
    scriptExists: fs.existsSync(scriptPath),
  });
});

router.post("/register", (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential || typeof credential !== "string" || !credential.trim()) {
      return res.status(400).json({
        success: false,
        message: "credential is required",
      });
    }

    const pid = launchFaceFlow([
      "--mode",
      "register",
      "--user",
      credential.trim(),
      "--force-overwrite",
    ]);

    res.json({
      success: true,
      message: "Driver face registration started. Complete it in the OpenCV window.",
      pid,
    });
  } catch (error) {
    console.error("Face register launch failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to launch driver face registration",
    });
  }
});

router.post("/verify", (req, res) => {
  try {
    const pid = launchFaceFlow(["--mode", "verify"]);

    res.json({
      success: true,
      message: "Driver face verification started. Complete it in the OpenCV window.",
      pid,
    });
  } catch (error) {
    console.error("Face verify launch failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to launch driver face verification",
    });
  }
});

router.post("/register-inapp", (req, res) => {
  try {
    const { credential, images } = req.body || {};
    if (!credential || typeof credential !== "string" || !credential.trim()) {
      return res.status(400).json({
        success: false,
        message: "credential is required",
      });
    }

    if (!Array.isArray(images) || images.length < 3) {
      return res.status(400).json({
        success: false,
        message: "3 face images are required (CENTER, LEFT, RIGHT)",
      });
    }

    const result = runInAppMl({
      mode: "register",
      credential: credential.trim(),
      payload: { images },
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || "Failed to register in-app face embeddings",
      });
    }

    res.json({
      success: true,
      message: "In-app face registration complete",
      samples: result.samples || 0,
    });
  } catch (error) {
    console.error("In-app face register failed:", error);
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to register in-app face",
    });
  }
});

router.post("/verify-inapp", (req, res) => {
  try {
    const { credential, image } = req.body || {};
    if (!credential || typeof credential !== "string" || !credential.trim()) {
      return res.status(400).json({
        success: false,
        message: "credential is required",
      });
    }

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        success: false,
        message: "image is required",
      });
    }

    const result = runInAppMl({
      mode: "verify",
      credential: credential.trim(),
      payload: { image },
    });

    res.json({
      success: Boolean(result.success),
      approved: Boolean(result.approved),
      similarity: Number(result.similarity || 0),
      accuracy: Number(result.accuracy || 0),
      message: result.message || (result.approved ? "Verification approved" : "Verification failed"),
    });
  } catch (error) {
    console.error("In-app face verify failed:", error);
    res.status(400).json({
      success: false,
      approved: false,
      message: error?.message || "Failed to verify in-app face",
    });
  }
});

export default router;
