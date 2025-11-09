import type { ModelMessage } from "ai";
import { createFileAdapter } from "./storage/resolver";
import type { FileAdapter, UriOrAdapter } from "./storage/types";
import {
  writeToolResultsToFileStrategy,
  type Boundary,
} from "./strategies/writeToolResultsToFile";

/**
 * Options for compacting a conversation by persisting large tool outputs to storage
 * and replacing them with lightweight references.
 */
export interface CompactOptions {
  /**
   * Compaction strategy to use. Currently only "write-tool-results-to-file" is supported.
   */
  strategy?: "write-tool-results-to-file" | string;
  /**
   * File system location to persist tool outputs. Accepts either a URI (e.g., "file:///path/to/dir")
   * or a FileAdapter instance. If omitted, defaults to the current working directory.
   */
  baseDir?: UriOrAdapter;
  /**
   * Controls where the compaction window starts. Defaults to "last-turn".
   * - "last-turn": Compact only the latest turn
   * - "all": Compact entire conversation
   * - { type: "keep-first", count: N }: Keep first N messages intact
   * - { type: "keep-last", count: N }: Keep last N messages intact
   */
  boundary?: Boundary;
  /**
   * Function to convert tool outputs (objects) to strings before writing to storage.
   * Defaults to JSON.stringify(value, null, 2).
   */
  toolResultSerializer?: (value: unknown) => string;
  /**
   * Tool names that are recognized as reading from storage (e.g., read/search tools). Their results
   * will not be re-written; instead, a friendly reference to the source is shown. Provide custom names
   * if you use your own read/search tools.
   */
  fileReaderTools?: string[];
  /**
   * Optional session ID to organize persisted tool results.
   * Files will be organized as: {baseDir}/{sessionId}/tool-results/{toolName}-{seq}.json
   * If omitted, a random session ID will be generated.
   */
  sessionId?: string;
}

/**
 * Compact a sequence of messages by writing large tool outputs to a configured storage and
 * replacing them with succinct references, keeping your model context lean.
 */
export async function compactMessages(
  messages: ModelMessage[],
  options: CompactOptions = {}
): Promise<ModelMessage[]> {
  const strategy = options.strategy ?? "write-tool-results-to-file";
  // Default: compact only since the last assistant/user text turn
  const boundary: Boundary = options.boundary ?? "last-turn";
  const adapter: FileAdapter = createFileAdapter(options.baseDir);
  const toolResultSerializer =
    options.toolResultSerializer ?? ((v) => JSON.stringify(v, null, 2));

  switch (strategy) {
    case "write-tool-results-to-file":
      return await writeToolResultsToFileStrategy(messages, {
        boundary,
        adapter,
        toolResultSerializer,
        fileReaderTools: [
          "readFile",
          "grepAndSearchFile",
          ...(options.fileReaderTools ?? []),
        ],
        sessionId: options.sessionId,
      });
    default:
      throw new Error(`Unknown compaction strategy: ${strategy}`);
  }
}

export type { FileAdapter } from "./storage/types";
export type { Boundary } from "./strategies/writeToolResultsToFile";
