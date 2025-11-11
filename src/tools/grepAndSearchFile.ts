import { tool } from "ai";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { grepObject } from "../tool-results-compactor/lib/grep";
import {
  createFileAdapter,
  type UriOrAdapter,
} from "../tool-results-compactor/lib/resolver";

export interface GrepAndSearchFileToolOptions {
  description?: string;
  /** Storage location. Accepts FileAdapter instance or URI string. Defaults to current working directory. */
  storage?: UriOrAdapter;
}

const defaultDescription = readFileSync(
  new URL("./descriptions/grepAndSearchFile.md", import.meta.url),
  "utf-8"
);

export function createGrepAndSearchFileTool(
  options: GrepAndSearchFileToolOptions = {}
) {
  // If a FileAdapter is passed, use it directly. Otherwise create one from URI or default.
  const adapter =
    typeof options.storage === "object" && options.storage
      ? options.storage
      : createFileAdapter(options.storage);

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
        // Try to search the file - if it exists, search it even if not in known keys
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
          }. Make sure the key is correct and the file exists. If needed, re-run the producing tool to persist and get a key.`,
          storage: adapter.toString(),
        };
      }
    },
  });
}
