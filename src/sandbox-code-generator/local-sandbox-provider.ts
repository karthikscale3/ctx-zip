import { execFile, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import type {
  CommandResult,
  SandboxCommand,
  SandboxFile,
  SandboxProvider,
  SandboxProviderOptions,
} from "./sandbox-provider.js";

const execFileAsync = promisify(execFile);

/**
 * Options for creating a local sandbox
 */
export interface LocalSandboxOptions extends SandboxProviderOptions {
  /**
   * Directory to use for the sandbox
   * @default "./.sandbox"
   */
  sandboxDir?: string;

  /**
   * Whether to clean the sandbox directory on creation
   * @default true
   */
  cleanOnCreate?: boolean;
}

/**
 * Command result implementation for local execution
 */
class LocalCommandResult implements CommandResult {
  constructor(
    public exitCode: number,
    private stdoutData: string,
    private stderrData: string
  ) {}

  async stdout(): Promise<string> {
    return this.stdoutData;
  }

  async stderr(): Promise<string> {
    return this.stderrData;
  }
}

/**
 * Local filesystem sandbox provider for development and debugging
 *
 * This provider writes files to a local directory and executes commands
 * using Node.js child_process. Useful for:
 * - Debugging MCP client code without E2B
 * - Local development and testing
 * - Inspecting generated files directly
 */
export class LocalSandboxProvider implements SandboxProvider {
  private workspacePath: string;
  private cwd: string;
  private sandboxId: string;

  private constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.sandboxId = `local-${Date.now()}`;
  }

  /**
   * Create a new local sandbox
   */
  static async create(
    options: LocalSandboxOptions = {}
  ): Promise<LocalSandboxProvider> {
    const sandboxDir = options.sandboxDir || "./.sandbox";
    const cleanOnCreate = options.cleanOnCreate ?? true;

    // Resolve to absolute path
    const workspacePath = path.resolve(sandboxDir);

    console.log(`✓ Creating local sandbox at: ${workspacePath}`);

    // Clean if requested
    if (cleanOnCreate && fs.existsSync(workspacePath)) {
      console.log(`  Cleaning existing sandbox directory...`);
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }

    // Create directory
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
      console.log(`  Created directory: ${workspacePath}`);
    }

    console.log(`✓ Local sandbox ready`);
    return new LocalSandboxProvider(workspacePath);
  }

  /**
   * Write multiple files to the local filesystem
   */
  async writeFiles(files: SandboxFile[]): Promise<void> {
    console.log(`✓ Writing ${files.length} file(s) to local filesystem...`);

    for (const file of files) {
      const content = file.content.toString("utf-8");

      // Handle paths that are already absolute and within workspace
      let fullPath: string;
      if (path.isAbsolute(file.path)) {
        // If the path is already absolute and starts with workspace path, use it directly
        if (file.path.startsWith(this.workspacePath)) {
          fullPath = file.path;
        } else {
          // If absolute but not in workspace, make it relative and join
          fullPath = path.join(this.workspacePath, file.path.substring(1));
        }
      } else {
        // Relative path - join with workspace
        fullPath = path.join(this.workspacePath, file.path);
      }

      console.log(`  Writing: ${fullPath} (${content.length} bytes)`);

      // Ensure directory exists
      const dirPath = path.dirname(fullPath);
      if (!fs.existsSync(dirPath)) {
        console.log(`  Creating directory: ${dirPath}`);
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Write the file
      fs.writeFileSync(fullPath, content, "utf-8");
      console.log(`  ✓ Written: ${fullPath}`);
    }

    console.log(`✓ Files written successfully`);
  }

  /**
   * Execute a command locally using Node.js child_process
   */
  async runCommand(command: SandboxCommand): Promise<CommandResult> {
    const fullCommand = [command.cmd, ...command.args].join(" ");

    try {
      // Use spawn for better output handling and long-running commands
      const result = await new Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
      }>((resolve, reject) => {
        const proc = spawn(command.cmd, command.args, {
          cwd: this.cwd,
          shell: true,
          env: { ...process.env },
        });

        let stdout = "";
        let stderr = "";

        proc.stdout?.on("data", (data) => {
          const chunk = data.toString();
          stdout += chunk;
          // Don't write to stdout - it pollutes the output
        });

        proc.stderr?.on("data", (data) => {
          const chunk = data.toString();
          stderr += chunk;
          // Don't write to stderr - it pollutes the output
        });

        proc.on("close", (code) => {
          resolve({
            exitCode: code || 0,
            stdout,
            stderr,
          });
        });

        proc.on("error", (error) => {
          reject(error);
        });
      });

      return new LocalCommandResult(
        result.exitCode,
        result.stdout,
        result.stderr
      );
    } catch (error) {
      console.error(`  Error executing command: ${error}`);
      throw error;
    }
  }

  /**
   * Cleanup the sandbox (no-op for local, files remain for inspection)
   */
  async stop(): Promise<void> {
    console.log(
      `✓ Local sandbox stopped (files preserved at: ${this.workspacePath})`
    );
  }

  /**
   * Get the unique sandbox identifier
   */
  getId(): string {
    return this.sandboxId;
  }

  /**
   * Get the workspace directory path
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Set the working directory for subsequent commands
   */
  setWorkingDirectory(path: string): void {
    this.cwd = path;
  }

  /**
   * Get the absolute path for inspection
   */
  getAbsolutePath(relativePath?: string): string {
    if (relativePath) {
      return path.join(this.workspacePath, relativePath);
    }
    return this.workspacePath;
  }
}
