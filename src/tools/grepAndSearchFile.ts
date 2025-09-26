import { tool } from "ai";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { FileStorageAdapter } from "../storage/file";
import { grepObject } from "../storage/grep";
import { isKnownKey } from "../storage/knownKeys";
import { createStorageAdapter } from "../storage/resolver";

export interface GrepAndSearchFileToolOptions {
  description?: string;
  baseDir?: string;
  /** Default storage used when input omitted. Accepts URI or adapter. */
  storage?: unknown;
}

const defaultDescription = readFileSync(
  new URL("./descriptions/grepAndSearchFile.md", import.meta.url),
  "utf-8"
);

export function createGrepAndSearchFileTool(
  options: GrepAndSearchFileToolOptions = {}
) {
  return tool({
    description: options.description ?? defaultDescription,
    inputSchema: z.object({
      key: z
        .string()
        .describe(
          "Relative storage key/path to search (no scheme). For file:// it is under the base dir; for blob:// it is under the prefix. Only use for files/blobs previously written in this conversation; cannot search arbitrary paths."
        ),
      pattern: z
        .string()
        .describe("JavaScript regex pattern (without slashes)")
        .min(1),
      flags: z
        .string()
        .optional()
        .describe("Regex flags, e.g., i, m, g (optional)"),
    }),
    async execute({ key, pattern, flags }) {
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch (err) {
        return {
          key,
          pattern,
          flags: flags ?? "",
          content: `Invalid regex: ${(err as Error).message}`,
        };
      }

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
            pattern,
            flags: flags ?? "",
            content:
              "Tool cannot be used: unknown key. Use a key previously surfaced via 'Written to ... Key: <key>' or 'Read from storage ... Key: <key>'. If none exists, re-run the producing tool to persist and get a key.",
            storage: storageUri,
          };
        }

        const matches = await grepObject(adapter, key, regex);
        return {
          key,
          pattern,
          flags: flags ?? "",
          matches,
          storage: adapter.toString(),
        };
      } catch (err) {
        return {
          key,
          pattern,
          flags: flags ?? "",
          content: `Error searching file: ${
            (err as Error).message
          }. Are you sure the storage is correct? If yes, make the original tool call again with the same arguments instead of relying on readFile or grepAndSearchFile.`,
        };
      }
    },
  });
}
