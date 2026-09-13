import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { exec } from "child_process";
import { PiperEngine } from "./piperEngine";

export class ModelSetupManager {
  private context: vscode.ExtensionContext;
  private piperEngine: PiperEngine;
  private isDownloading: boolean = false;

  constructor(context: vscode.ExtensionContext, piperEngine: PiperEngine) {
    this.context = context;
    this.piperEngine = piperEngine;
  }

  public isDownloadingNow(): boolean {
    return this.isDownloading;
  }

  public isEverythingReady(): boolean {
    const female = this.piperEngine.isReady("female");
    const male = this.piperEngine.isReady("male");
    return female.ready && male.ready;
  }

  /**
   * Automatically triggered on extension startup / install
   */
  public async autoCheckAndDownloadOnStartup(): Promise<void> {
    if (this.isEverythingReady() || this.isDownloading) {
      return;
    }

    console.log("ALISHA: Auto-downloading offline neural models and Piper binary in background...");
    this.downloadOfflineAssets(true);
  }

  public async downloadOfflineAssets(isBackground: boolean = false): Promise<boolean> {
    if (this.isDownloading) {
      vscode.window.showInformationMessage("ALISHA: Voice model download is already in progress.");
      return false;
    }

    this.isDownloading = true;

    return await vscode.window.withProgress({
      location: isBackground ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification,
      title: "ALISHA: Downloading offline neural voices & engine...",
      cancellable: false
    }, async (progress) => {
      try {
        const binDir = path.join(this.context.extensionPath, "bin");
        const voicesDir = path.join(this.context.extensionPath, "voices");

        if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
        if (!fs.existsSync(voicesDir)) fs.mkdirSync(voicesDir, { recursive: true });

        // Step 1: Download & extract Piper engine binary if missing
        if (!this.piperEngine.getExecutablePath()) {
          progress.report({ message: "Downloading Piper neural TTS engine..." });
          await this.downloadAndExtractPiperBinary(binDir);
        }

        // Step 2: Download Voice Models from HuggingFace using curl.exe
        const voices = [
          {
            name: "Amy (Female Voice)",
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx",
            dest: path.join(voicesDir, "en_US-amy-medium.onnx"),
            expectedMinSize: 60_000_000
          },
          {
            name: "Amy Config",
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json",
            dest: path.join(voicesDir, "en_US-amy-medium.onnx.json"),
            expectedMinSize: 4000
          },
          {
            name: "Ryan (Male Voice)",
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx",
            dest: path.join(voicesDir, "en_US-ryan-medium.onnx"),
            expectedMinSize: 60_000_000
          },
          {
            name: "Ryan Config",
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json",
            dest: path.join(voicesDir, "en_US-ryan-medium.onnx.json"),
            expectedMinSize: 4000
          }
        ];

        for (let i = 0; i < voices.length; i++) {
          const item = voices[i];
          const needsDownload = !fs.existsSync(item.dest) ||
            (item.expectedMinSize && fs.statSync(item.dest).size < item.expectedMinSize);

          if (needsDownload) {
            progress.report({ message: `Downloading ${item.name} (${i + 1}/${voices.length})...` });
            await this.downloadWithCurl(item.url, item.dest);
          }
        }

        this.isDownloading = false;
        vscode.window.showInformationMessage("🔊 ALISHA: 100% Offline neural voices installed and ready!");
        return true;
      } catch (err: any) {
        this.isDownloading = false;
        console.error("ALISHA Setup Error:", err);
        vscode.window.showErrorMessage(`ALISHA: Failed to download models: ${err.message}`);
        return false;
      }
    });
  }

  private async downloadAndExtractPiperBinary(binDir: string): Promise<void> {
    const platform = os.platform();

    if (platform === "win32") {
      const tempZip = path.join(os.tmpdir(), `piper_win_${Date.now()}.zip`);
      const targetDir = path.join(binDir, "win32");
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      await this.downloadWithCurl(
        "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip",
        tempZip
      );
      await this.runShellCommand(
        `powershell -Command "Expand-Archive -LiteralPath '${tempZip}' -DestinationPath '${targetDir}' -Force"`
      );
      fs.unlink(tempZip, () => {});
    } else if (platform === "darwin") {
      const arch = os.arch();
      const tarUrl = arch === "arm64"
        ? "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_aarch64.tar.gz"
        : "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz";
      const targetDir = path.join(binDir, "darwin");
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const tempTar = path.join(os.tmpdir(), `piper_mac_${Date.now()}.tar.gz`);

      await this.downloadWithCurl(tarUrl, tempTar);
      await this.runShellCommand(`tar -xzf "${tempTar}" -C "${targetDir}"`);
      fs.unlink(tempTar, () => {});
    } else {
      const tarUrl = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz";
      const targetDir = path.join(binDir, "linux");
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const tempTar = path.join(os.tmpdir(), `piper_linux_${Date.now()}.tar.gz`);

      await this.downloadWithCurl(tarUrl, tempTar);
      await this.runShellCommand(`tar -xzf "${tempTar}" -C "${targetDir}"`);
      fs.unlink(tempTar, () => {});
    }
  }

  /**
   * Uses OS curl.exe for robust downloading with retries
   */
  private downloadWithCurl(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = `curl.exe -L --retry 10 --retry-delay 3 --retry-connrefused -o "${dest}" "${url}"`;
      exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 600_000 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`curl download failed: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  private runShellCommand(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
