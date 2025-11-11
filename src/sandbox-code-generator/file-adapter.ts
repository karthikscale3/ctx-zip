import type { ReadStream } from "node:fs";
import fs from "node:fs";
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SandboxProvider } from "./sandbox-provider.js";

export interface FileWriteParams {
  key: string;
  body: string | Uint8Array;
  contentType?: string;
}

export interface FileReadParams {
  key: string;
}

export interface FileWriteResult {
  key: string;
  url?: string;
}

export interface FileAdapter {
  write(params: FileWriteParams): Promise<FileWriteResult>;
  readText?(params: FileReadParams): Promise<string>;
  openReadStream?(
    params: FileReadParams
  ): Promise<NodeJS.ReadableStream | ReadStream>;
  resolveKey(name: string): string;
  toString(): string;
}

/**
 * Options for creating a local file adapter
 */
export interface LocalFileAdapterOptions {
  baseDir: string; // absolute directory
  prefix?: string; // optional subdir/prefix inside baseDir (defaults to "compact")
  sessionId?: string; // optional session ID for organizing tool results
}

/**
 * File adapter that writes to the local filesystem
 */
export class LocalFileAdapter implements FileAdapter {
  private baseDir: string;
  private prefix: string;
  private sessionId: string | undefined;

  constructor(options: LocalFileAdapterOptions) {
    this.baseDir = options.baseDir;
    this.prefix = options.prefix ?? "compact";
    this.sessionId = options.sessionId;
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
    const fullPath = path.resolve(this.baseDir, params.key);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    const body =
      typeof params.body === "string" ? params.body : Buffer.from(params.body);
    await fsWriteFile(fullPath, body, "utf8");
    const url = new URL(`file://${fullPath}`);
    return { key: params.key, url: url.toString() };
  }

  async readText(params: FileReadParams): Promise<string> {
    const fullPath = path.resolve(this.baseDir, params.key);
    return await fsReadFile(fullPath, "utf8");
  }

  async openReadStream(params: FileReadParams) {
    const fullPath = path.resolve(this.baseDir, params.key);
    return fs.createReadStream(fullPath);
  }

  toString(): string {
    const parts = [this.baseDir];
    if (this.prefix) parts.push(this.prefix);
    // Don't include sessionId here - it's already part of resolved keys
    return `file://${parts.join("/")}`;
  }
}

export function fileUriToOptions(uri: string): LocalFileAdapterOptions {
  // Expect file:///abs/path or file:/abs/path
  const url = new URL(uri);
  if (url.protocol !== "file:") {
    throw new Error(`Invalid file URI: ${uri}`);
  }
  const baseDir = fileURLToPath(url);
  return { baseDir };
}

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
export class SandboxFileAdapter implements FileAdapter {
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
