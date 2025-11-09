import fs from "node:fs";
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FileReadParams,
  FileWriteParams,
  FileWriteResult,
  FileAdapter as IFileAdapter,
} from "./types";

export interface FileAdapterOptions {
  baseDir: string; // absolute directory
  prefix?: string; // optional subdir/prefix inside baseDir
  sessionId?: string; // optional session ID for organizing tool results
}

export class FileAdapter implements IFileAdapter {
  private baseDir: string;
  private prefix: string;
  private sessionId: string | undefined;

  constructor(options: FileAdapterOptions) {
    this.baseDir = options.baseDir;
    this.prefix = options.prefix ?? "";
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
    if (this.sessionId) parts.push(this.sessionId, "tool-results");
    return `file://${parts.join("/")}`;
  }
}

export function fileUriToOptions(uri: string): FileAdapterOptions {
  // Expect file:///abs/path or file:/abs/path
  const url = new URL(uri);
  if (url.protocol !== "file:") {
    throw new Error(`Invalid file URI: ${uri}`);
  }
  const baseDir = fileURLToPath(url);
  return { baseDir };
}
