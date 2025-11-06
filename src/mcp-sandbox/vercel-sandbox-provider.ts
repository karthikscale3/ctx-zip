// Vercel Sandbox provider implementation

import { Sandbox } from "@vercel/sandbox";
import type {
  CommandResult,
  SandboxCommand,
  SandboxFile,
  SandboxProvider,
  SandboxProviderOptions,
} from "./sandbox-provider.js";

/**
 * Vercel-specific sandbox options
 */
export interface VercelSandboxOptions extends SandboxProviderOptions {
  runtime?: "node22" | "python3.13";
  vcpus?: number;
}

/**
 * Vercel Sandbox provider implementation
 */
export class VercelSandboxProvider implements SandboxProvider {
  private sandbox: Sandbox;
  private workspacePath: string = "/vercel/sandbox";

  private constructor(sandbox: Sandbox) {
    this.sandbox = sandbox;
  }

  /**
   * Create a new Vercel sandbox instance
   */
  static async create(
    options: VercelSandboxOptions = {}
  ): Promise<VercelSandboxProvider> {
    console.log(
      `✓ Creating Vercel Sandbox (runtime: ${options.runtime || "node22"})`
    );

    const sandbox = await Sandbox.create({
      timeout: options.timeout || 1800000,
      runtime: options.runtime || "node22",
      resources: {
        vcpus: options.vcpus || 4,
      },
    });

    console.log("✓ Sandbox created");
    return new VercelSandboxProvider(sandbox);
  }

  async writeFiles(files: SandboxFile[]): Promise<void> {
    await this.sandbox.writeFiles(files);
  }

  async runCommand(command: SandboxCommand): Promise<CommandResult> {
    return await this.sandbox.runCommand({
      cmd: command.cmd,
      args: command.args,
    });
  }

  async stop(): Promise<void> {
    await this.sandbox.stop();
  }

  getId(): string {
    // Vercel sandbox doesn't expose an ID, so we create a simple identifier
    return `vercel-sandbox-${Date.now()}`;
  }

  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Get the underlying Vercel sandbox instance (for advanced use cases)
   */
  getVercelSandbox(): Sandbox {
    return this.sandbox;
  }
}
