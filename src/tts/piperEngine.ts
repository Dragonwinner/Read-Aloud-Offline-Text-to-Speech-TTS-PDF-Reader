import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { spawn } from "child_process";
import { VoiceGender } from "../types";

export interface VoiceModelPaths {
  modelPath: string;
  configPath: string;
  voiceName: string;
}

export class PiperEngine {
  private extensionContext: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.extensionContext = context;
  }

  /**
   * Resolves the executable path for the current OS platform
   */
  public getExecutablePath(): string | null {
    const config = vscode.workspace.getConfiguration("alishaVoice");
    const customPath = config.get<string>("customPiperPath", "").trim();

    if (customPath && fs.existsSync(customPath)) {
      return customPath;
    }

    const platform = os.platform();
    const binDir = path.join(this.extensionContext.extensionPath, "bin");

    const possiblePaths: string[] = [];

    if (platform === "win32") {
      possiblePaths.push(
        path.join(binDir, "win32", "piper.exe"),
        path.join(binDir, "win32", "piper", "piper.exe"),
        path.join(binDir, "piper", "piper.exe")
      );
    } else if (platform === "darwin") {
      possiblePaths.push(
        path.join(binDir, "darwin", "piper"),
        path.join(binDir, "darwin", "piper", "piper"),
        path.join(binDir, "piper", "piper")
      );
    } else {
      possiblePaths.push(
        path.join(binDir, "linux", "piper"),
        path.join(binDir, "linux", "piper", "piper"),
        path.join(binDir, "piper", "piper")
      );
    }

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Resolves voice model paths for female/male
   */
  public getVoiceModel(gender: VoiceGender): VoiceModelPaths | null {
    const voicesDir = path.join(this.extensionContext.extensionPath, "voices");
    const voiceName = gender === "male" ? "en_US-ryan-medium" : "en_US-amy-medium";

    const modelPath = path.join(voicesDir, `${voiceName}.onnx`);
    const configPath = path.join(voicesDir, `${voiceName}.onnx.json`);

    if (fs.existsSync(modelPath) && fs.existsSync(configPath)) {
      return { modelPath, configPath, voiceName };
    }

    return null;
  }

  /**
   * Checks if offline neural Piper model and binary are installed
   */
  public isNeuralReady(gender: VoiceGender): boolean {
    const exe = this.getExecutablePath();
    const voice = this.getVoiceModel(gender);
    return !!(exe && voice);
  }

  /**
   * Validates if local binary, voice models, or platform fallbacks are available
   */
  public isReady(gender: VoiceGender): { ready: boolean; reason?: string } {
    if (this.isNeuralReady(gender)) {
      return { ready: true };
    }

    // Platform independent zero-internet fallback
    const platform = os.platform();
    if (platform === "win32" || platform === "darwin" || platform === "linux") {
      return { ready: true };
    }

    return {
      ready: false,
      reason: "No offline neural engine or system speech engine found for this platform."
    };
  }

  /**
   * Synthesizes a text chunk directly to a temporary WAV file on disk.
   */
  public async synthesizeChunkToWavFile(text: string, gender: VoiceGender, speed: number = 1.0): Promise<string> {
    if (!this.isNeuralReady(gender)) {
      // Use zero-internet platform-independent fallback (macOS say, Linux espeak, Windows SAPI)
      return this.synthesizeWithPlatformFallback(text, gender, speed);
    }

    const binaryPath = this.getExecutablePath()!;
    const voice = this.getVoiceModel(gender)!;
    const tempOutputDir = os.tmpdir();
    const outputPath = path.join(tempOutputDir, `alisha_chunk_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);

    const binaryDir = path.dirname(binaryPath);

    // In Piper TTS, length_scale controls phoneme duration (inverse of playback speed)
    // speed 0.5x -> length_scale 2.0 (slower, natural pitch)
    // speed 0.75x -> length_scale 1.333
    // speed 1.0x -> length_scale 1.0
    // speed 1.5x -> length_scale 0.667
    // speed 2.0x -> length_scale 0.5
    const safeSpeed = Math.max(0.3, Math.min(3.0, speed || 1.0));
    const lengthScale = (1.0 / safeSpeed).toFixed(3);

    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, [
        "--model", voice.modelPath,
        "--config", voice.configPath,
        "--output_file", outputPath,
        "--length_scale", lengthScale
      ], {
        cwd: binaryDir,
        windowsHide: true
      });

      child.stdin.write(text);
      child.stdin.end();

      let errOutput = "";
      child.stderr.on("data", (data) => {
        errOutput += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch {}
          reject(new Error(`Piper synthesis error (code ${code}): ${errOutput}`));
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to spawn Piper binary: ${err.message}`));
      });
    });
  }

  /**
   * Universal offline platform-independent fallback (macOS say, Linux espeak, Windows SAPI)
   */
  public async synthesizeWithPlatformFallback(text: string, gender: VoiceGender, speed: number = 1.0): Promise<string> {
    const tempOutputDir = os.tmpdir();
    const outputPath = path.join(tempOutputDir, `alisha_fallback_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);
    const platform = os.platform();

    if (platform === "darwin") {
      // macOS built-in say command (offline, zero-install)
      const rate = Math.round(175 * (speed || 1.0));
      const voice = gender === "male" ? "Alex" : "Samantha";
      return new Promise((resolve, reject) => {
        const child = spawn("say", [
          "-v", voice,
          "-r", rate.toString(),
          "-o", outputPath,
          "--data-format=LEI16@22050",
          text
        ]);
        child.on("close", (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve(outputPath);
          } else {
            reject(new Error(`macOS say command failed with code ${code}`));
          }
        });
      });
    } else if (platform === "win32") {
      // Windows PowerShell SAPI fallback (offline, zero-install)
      const safeRate = Math.round(Math.max(-10, Math.min(10, (speed - 1.0) * 10)));
      const escapedText = text.replace(/'/g, "''");
      const psScript = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = ${safeRate}; $synth.SetOutputToWaveFile('${outputPath}'); $synth.Speak('${escapedText}'); $synth.Dispose();`;
      return new Promise((resolve, reject) => {
        const ps = spawn("powershell", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          psScript
        ], { windowsHide: true });

        ps.on("close", (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve(outputPath);
          } else {
            reject(new Error(`Windows SAPI fallback failed with code ${code}`));
          }
        });
      });
    } else {
      // Linux espeak fallback (offline)
      const rate = Math.round(175 * (speed || 1.0));
      const voice = gender === "male" ? "en-us" : "en-us+f3";
      return new Promise((resolve, reject) => {
        const child = spawn("espeak", [
          "-v", voice,
          "-s", rate.toString(),
          "-w", outputPath,
          text
        ]);
        child.on("close", (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve(outputPath);
          } else {
            reject(new Error(`Linux espeak fallback failed with code ${code}`));
          }
        });
      });
    }
  }

  /**
   * Synthesizes a text chunk to a base64 WAV string completely offline
   */
  public async synthesizeChunk(text: string, gender: VoiceGender, speed: number = 1.0): Promise<string> {
    const wavPath = await this.synthesizeChunkToWavFile(text, gender, speed);
    try {
      const buffer = fs.readFileSync(wavPath);
      return buffer.toString("base64");
    } finally {
      try {
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      } catch {}
    }
  }
}
