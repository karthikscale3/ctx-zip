import { tool } from "ai";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { FileStorageAdapter } from "../storage/file";
import { isKnownKey } from "../storage/knownKeys";
import { createStorageAdapter } from "../storage/resolver";

export interface ReadFileToolOptions {
  description?: string;
  baseDir?: string;
  /** Default storage used when input omitted. Accepts URI or adapter. */
  storage?: unknown;
}

const defaultDescription = readFileSync(
  new URL("./descriptions/readFile.md", import.meta.url),
  "utf-8"
);

export function createReadFileTool(options: ReadFileToolOptions = {}) {
  return tool({
    description: options.description ?? defaultDescription,
    inputSchema: z.object({
      key: z
        .string()
        .describe(
          "Relative storage key/path to read (no scheme). For file:// it is under the base dir; for blob:// it is under the prefix. Only use for files/blobs previously written in this conversation; cannot read arbitrary paths."
        ),
    }),
    async execute({ key }) {
      try {
        const adapter = options.storage
          ? createStorageAdapter(options.storage as any)
          : options.baseDir
          ? new FileStorageAdapter({ baseDir: options.baseDir })
          : createStorageAdapter();

        const storageUri = adapter.toString();
        if (!isKnownKey(storageUri, key)) {
          return {
            key,
            content:
              "Tool cannot be used: unknown key. Use a key previously surfaced via 'Written to ... Key: <key>' or 'Read from storage ... Key: <key>'. If none exists, re-run the producing tool to persist and get a key.",
            storage: storageUri,
          };
        }

        if (!adapter.readText) {
          return {
            key,
            content:
              "No readText method found in storage adapter. Are you sure the storage is correct? If yes, make the original tool call again with the same arguments instead of relying on readFile or grepAndSearchFile.",
            storage: adapter.toString(),
          };
        }
        const content = await adapter.readText({ key });
        return { key, content, storage: adapter.toString() };
      } catch (err) {
        return {
          key,
          content: `Error reading file: ${
            (err as Error).message
          }. Are you sure the storage is correct? If yes, make the original tool call again with the same arguments instead of relying on readFile or grepAndSearchFile.`,
        };
      }
    },
  });
}
