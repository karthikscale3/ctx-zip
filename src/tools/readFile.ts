import { tool } from "ai";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { isKnownKey } from "../storage/knownKeys";
import { createFileAdapter } from "../storage/resolver";

export interface ReadFileToolOptions {
  description?: string;
  /** Default file system location used when input omitted. Accepts URI or adapter. */
  baseDir?: unknown;
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
          "Relative storage key/path to read (no scheme). For file:// storage it is under the base directory. Only use for files previously written in this conversation; cannot read arbitrary paths."
        ),
    }),
    async execute({ key }) {
      try {
        const adapter = options.baseDir
          ? createFileAdapter(options.baseDir as any)
          : createFileAdapter();

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
