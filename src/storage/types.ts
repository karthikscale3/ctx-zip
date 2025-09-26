import type { ReadStream } from "node:fs";

export interface StorageWriteParams {
  key: string;
  body: string | Uint8Array;
  contentType?: string;
}

export interface StorageReadParams {
  key: string;
}

export interface StorageWriteResult {
  key: string;
  url?: string;
}

export interface StorageAdapter {
  write(params: StorageWriteParams): Promise<StorageWriteResult>;
  readText?(params: StorageReadParams): Promise<string>;
  openReadStream?(
    params: StorageReadParams
  ): Promise<NodeJS.ReadableStream | ReadStream>;
  resolveKey(name: string): string;
  toString(): string;
}

export type UriOrAdapter = string | StorageAdapter | undefined;
