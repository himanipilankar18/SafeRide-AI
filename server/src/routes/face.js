import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultScriptPath = path.resolve(__dirname, "../../python/face_auth_app.py");
const scriptPath = process.env.FACE_SCRIPT_PATH || defaultScriptPath;

const getPythonCommandConfig = () => {
  const custom = process.env.FACE_PYTHON_CMD?.trim();
  if (custom) {
    return {
      command: custom,
      preArgs: [],
    };
  }

  if (process.platform === "win32") {
    return {
      command: "py",
      preArgs: ["-3"],
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

  const child = spawn(pythonConfig.command, [...pythonConfig.preArgs, scriptPath, ...args], {
    cwd: path.dirname(scriptPath),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false,
  });

  child.on("error", (error) => {
    console.error("Failed to spawn face process:", error);
  });

  child.unref();
  return child.pid;
};

router.get("/status", (req, res) => {
  const pythonConfig = getPythonCommandConfig();
  res.json({
    success: true,
    pythonCmd: pythonConfig.command,
    pythonPreArgs: pythonConfig.preArgs,
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

export default router;
