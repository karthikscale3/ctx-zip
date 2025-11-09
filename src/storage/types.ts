import type { ReadStream } from "node:fs";

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

export type UriOrAdapter = string | FileAdapter | undefined;

/**
 * Metadata wrapper for persisted tool results
 */
export interface PersistedToolResult {
  metadata: {
    toolName: string;
    timestamp: string;
    toolCallId: string;
    sessionId: string;
  };
  output: any;
}
