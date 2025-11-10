import type { SandboxProvider } from "../../mcp-code-transformer/sandbox-provider.js";
import type {
  FileReadParams,
  FileWriteParams,
  FileWriteResult,
  FileAdapter as IFileAdapter,
} from "./types";

/**
 * Options for creating a sandbox file adapter
 */
export interface SandboxFileAdapterOptions {
  sandboxProvider: SandboxProvider;
  prefix?: string; // optional subdir/prefix inside sandbox workspace
  sessionId?: string; // optional session ID for organizing tool results
}

/**
 * File adapter that writes to a sandbox provider (E2B, Vercel, etc.)
 * instead of the local filesystem
 */
export class SandboxFileAdapter implements IFileAdapter {
  private sandboxProvider: SandboxProvider;
  private prefix: string;
  private sessionId: string | undefined;
  private workspacePath: string;

  constructor(options: SandboxFileAdapterOptions) {
    this.sandboxProvider = options.sandboxProvider;
    this.prefix = options.prefix ?? "";
    this.sessionId = options.sessionId;
    this.workspacePath = options.sandboxProvider.getWorkspacePath();
  }

  resolveKey(name: string): string {
    const safe = name.replace(/\\/g, "/").replace(/\.+\//g, "");

    // Build path with session support: [prefix/][sessionId/tool-results/]name
    const parts: string[] = [];
    if (this.prefix) parts.push(this.prefix.replace(/\/$/, ""));
    if (this.sessionId) parts.push(this.sessionId, "tool-results");
    parts.push(safe);

    return parts.join("/");
  }

  async write(params: FileWriteParams): Promise<FileWriteResult> {
    const relativePath = params.key;
    const fullPath = `${this.workspacePath}/${relativePath}`;

    // Convert body to Buffer if string
    const content: Buffer =
      typeof params.body === "string"
        ? Buffer.from(params.body, "utf-8")
        : Buffer.isBuffer(params.body)
        ? params.body
        : Buffer.from(params.body);

    // Write file to sandbox
    await this.sandboxProvider.writeFiles([
      {
        path: fullPath,
        content,
      },
    ]);

    // Return result with sandbox path
    const url = `sandbox://${this.sandboxProvider.getId()}/${relativePath}`;
    return { key: params.key, url };
  }

  async readText(params: FileReadParams): Promise<string> {
    const relativePath = params.key;
    const fullPath = `${this.workspacePath}/${relativePath}`;

    // Read file from sandbox using cat command
    const result = await this.sandboxProvider.runCommand({
      cmd: "cat",
      args: [fullPath],
    });

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new Error(`Failed to read file ${fullPath}: ${stderr}`);
    }

    return await result.stdout();
  }

  async openReadStream(params: FileReadParams) {
    // For sandbox, we'll read the entire file and create a stream from it
    const content = await this.readText(params);
    const { Readable } = await import("stream");
    return Readable.from([content]);
  }

  toString(): string {
    // Use a custom scheme that uniquely identifies this sandbox adapter
    // Format: sandbox://{sandboxId}
    return `sandbox://${this.sandboxProvider.getId()}`;
  }
}
