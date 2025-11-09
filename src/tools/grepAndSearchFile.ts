import { tool } from "ai";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { grepObject } from "../storage/grep";
import { isKnownKey } from "../storage/knownKeys";
import { createFileAdapter } from "../storage/resolver";

export interface GrepAndSearchFileToolOptions {
  description?: string;
  /** Default file system location used when input omitted. Accepts URI or adapter. */
  baseDir?: unknown;
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
          "Relative storage key/path to search (no scheme). For file:// storage it is under the base directory. Only use for files previously written in this conversation; cannot search arbitrary paths."
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
        const adapter = options.baseDir
          ? createFileAdapter(options.baseDir as any)
          : createFileAdapter();

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
