// E2B Sandbox provider implementation

import { Sandbox } from "@e2b/code-interpreter";
import type {
  CommandResult,
  SandboxCommand,
  SandboxFile,
  SandboxProvider,
  SandboxProviderOptions,
} from "./sandbox-provider.js";

/**
 * E2B-specific sandbox options
 */
export interface E2BSandboxOptions extends SandboxProviderOptions {
  apiKey?: string;
  template?: string; // E2B template ID, defaults to base Node.js template
  metadata?: Record<string, string>;
  cwd?: string; // Working directory for commands
}

/**
 * Command result implementation for E2B
 */
class E2BCommandResult implements CommandResult {
  constructor(
    public exitCode: number,
    private stdoutContent: string,
    private stderrContent: string
  ) {}

  async stdout(): Promise<string> {
    return this.stdoutContent;
  }

  async stderr(): Promise<string> {
    return this.stderrContent;
  }
}

/**
 * E2B Sandbox provider implementation
 * Supports running TypeScript/Node.js code in isolated cloud sandboxes
 */
export class E2BSandboxProvider implements SandboxProvider {
  private sandbox: Sandbox;
  private workspacePath: string = "/home/user";
  private cwd: string;
  private sandboxId: string;

  private constructor(sandbox: Sandbox, options: E2BSandboxOptions = {}) {
    this.sandbox = sandbox;
    this.sandboxId = sandbox.sandboxId;
    this.cwd = options.cwd || this.workspacePath;
  }

  /**
   * Create a new E2B sandbox instance
   */
  static async create(
    options: E2BSandboxOptions = {}
  ): Promise<E2BSandboxProvider> {
    console.log(
      `✓ Creating E2B Sandbox (template: ${options.template || "base"})`
    );

    const config: any = {
      apiKey: options.apiKey || process.env.E2B_API_KEY,
      timeoutMs: options.timeout || 1800000, // 30 minutes default
    };

    if (options.template) {
      config.template = options.template;
    }

    if (options.metadata) {
      config.metadata = options.metadata;
    }

    const sandbox = await Sandbox.create(config);

    console.log(`✓ E2B Sandbox created (ID: ${sandbox.sandboxId})`);
    return new E2BSandboxProvider(sandbox, options);
  }

  /**
   * Write multiple files to the sandbox
   */
  async writeFiles(files: SandboxFile[]): Promise<void> {
    console.log(`✓ Writing ${files.length} file(s) to E2B sandbox...`);

    for (const file of files) {
      const content = file.content.toString("utf-8");
      const fullPath = file.path.startsWith("/")
        ? file.path
        : `${this.workspacePath}/${file.path}`;

      console.log(`  Writing: ${fullPath} (${content.length} bytes)`);

      // Ensure directory exists
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
      if (dirPath && dirPath !== this.workspacePath) {
        console.log(`  Creating directory: ${dirPath}`);
        await this.sandbox.commands.run(`mkdir -p ${dirPath}`);
      }

      // Write the file
      await this.sandbox.files.write(fullPath, content);
      console.log(`  ✓ Written: ${fullPath}`);
    }

    console.log(`✓ Files written successfully`);
  }

  /**
   * Execute a command in the sandbox
   */
  async runCommand(command: SandboxCommand): Promise<CommandResult> {
    const fullCommand = [command.cmd, ...command.args].join(" ");
    console.log(`✓ Executing command: ${fullCommand}`);
    console.log(`  Working directory: ${this.cwd}`);

    // E2B has a separate timeout for command execution
    // Set it to 5 minutes for long-running operations like MCP calls
    const result = await this.sandbox.commands.run(fullCommand, {
      cwd: this.cwd,
      timeoutMs: 300000, // 5 minutes
    });

    console.log(`  Exit code: ${result.exitCode}`);
    if (result.stdout) {
      console.log(`  Stdout length: ${result.stdout.length} chars`);
      if (result.stdout.length < 500) {
        console.log(`  Stdout: ${result.stdout}`);
      }
    }
    if (result.stderr) {
      console.log(`  Stderr length: ${result.stderr.length} chars`);
      if (result.stderr.length > 0) {
        console.log(`  Stderr: ${result.stderr}`);
      }
    }

    return new E2BCommandResult(result.exitCode, result.stdout, result.stderr);
  }

  /**
   * Stop and cleanup the sandbox
   */
  async stop(): Promise<void> {
    console.log(`✓ Stopping E2B sandbox (ID: ${this.sandboxId})`);
    await this.sandbox.kill();
    console.log("✓ E2B sandbox stopped");
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
   * Get the underlying E2B sandbox instance (for advanced use cases)
   */
  getE2BSandbox(): Sandbox {
    return this.sandbox;
  }

  /**
   * Install npm packages in the sandbox
   */
  async installPackages(packages: string[]): Promise<CommandResult> {
    console.log(`✓ Installing npm packages: ${packages.join(", ")}`);
    return await this.runCommand({
      cmd: "npm",
      args: ["install", ...packages],
    });
  }

  /**
   * Run a TypeScript file using ts-node
   */
  async runTypeScript(filePath: string): Promise<CommandResult> {
    console.log(`✓ Running TypeScript file: ${filePath}`);

    // Check if file exists
    try {
      const checkResult = await this.sandbox.commands.run(
        `test -f ${filePath} && echo "exists" || echo "not found"`
      );
      console.log(`  File check: ${checkResult.stdout}`);
    } catch (err) {
      console.log(`  Warning: Could not check file existence: ${err}`);
    }

    // First, ensure ts-node and typescript are installed
    const installResult = await this.installPackages([
      "typescript",
      "ts-node",
      "@types/node",
    ]);
    if (installResult.exitCode !== 0) {
      console.log(`  Warning: Package installation had non-zero exit code`);
    }

    return await this.runCommand({
      cmd: "npx",
      args: ["ts-node", filePath],
    });
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(path: string): Promise<string> {
    const fullPath = path.startsWith("/")
      ? path
      : `${this.workspacePath}/${path}`;
    return await this.sandbox.files.read(fullPath);
  }

  /**
   * List files in a directory
   */
  async listFiles(path: string = this.workspacePath): Promise<string[]> {
    const result = await this.sandbox.commands.run(`ls -1 ${path}`);
    return result.stdout.split("\n").filter((f) => f.trim().length > 0);
  }
}
