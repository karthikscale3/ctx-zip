import type { ModelMessage } from "ai";
import { randomUUID } from "node:crypto";
import type { FileAdapter } from "../../sandbox-code-generator/file-adapter.js";

/**
 * Metadata wrapper for persisted tool results
 */
interface PersistedToolResult {
  metadata: {
    toolName: string;
    timestamp: string;
    toolCallId: string;
    sessionId: string;
  };
  output: any;
}

function formatStoragePathForDisplay(storageUri: string, key: string): string {
  if (!storageUri) return key;
  // For file:// and sandbox:// URIs, show the full path
  if (storageUri.startsWith("file://") || storageUri.startsWith("sandbox://")) {
    const base = storageUri.replace(/\/$/, "");
    return `${base}/${key}`;
  }
  // Default formatting uses colon separation
  return `${storageUri}:${key}`;
}

/**
 * Determine whether a message has textual content (string or text parts).
 * Used to detect conversational boundaries for compaction.
 */
export function messageHasTextContent(message: ModelMessage | any): boolean {
  if (!message) return false;
  const content: any = (message as any).content;
  if (typeof content === "string") return true;
  if (Array.isArray(content)) {
    return content.some(
      (part: any) =>
        part && part.type === "text" && typeof part.text === "string"
    );
  }
  return false;
}

/**
 * Controls where the compaction window starts.
 *
 * - "all": Start at the beginning. Use this to re-compact the full history
 *   or when earlier tool outputs also need persisting.
 * - { type: "keep-first", count: number }: Keep the first N messages intact and start
 *   compaction afterwards. Useful to preserve initial system/instructions or early context.
 * - { type: "keep-last", count: number }: Keep the last N messages intact and compact
 *   everything before them. Useful to preserve recent context while compacting older messages.
 */
export type Boundary =
  | "all"
  | { type: "keep-first"; count: number }
  | { type: "keep-last"; count: number };

/**
 * Determine the starting index of the compaction window based on the chosen boundary.
 */
/**
 * Determine the starting index of the compaction window based on the chosen boundary.
 */
export function detectWindowStart(
  messages: ModelMessage[] | any[],
  boundary: Boundary
): number {
  // Start compaction after the first N messages (keep the first N intact)
  if (
    typeof boundary === "object" &&
    boundary !== null &&
    (boundary as any).type === "keep-first"
  ) {
    const countRaw = (boundary as any).count;
    const n = Number.isFinite(countRaw)
      ? Math.max(0, Math.floor(countRaw as number))
      : 0;
    const len = Array.isArray(messages) ? messages.length : 0;
    // We never compact the final assistant message (loop iterates to length - 1),
    // so clamp the start within [0, len - 1]
    const upperBound = Math.max(0, len - 1);
    return Math.min(n, upperBound);
  }
  // Start compaction from the beginning (keep the last N messages intact)
  if (
    typeof boundary === "object" &&
    boundary !== null &&
    (boundary as any).type === "keep-last"
  ) {
    // Start from 0, will be bounded by endExclusive in detectWindowBounds
    return 0;
  }
  if (boundary === "all") return 0;
  const msgs: any[] = Array.isArray(messages) ? messages : [];
  let windowStart = 0;
  for (let i = msgs.length - 2; i >= 0; i--) {
    const m = msgs[i];
    const isBoundary =
      m &&
      (m.role === "assistant" || m.role === "user") &&
      messageHasTextContent(m);
    if (isBoundary) {
      windowStart = i + 1;
      break;
    }
  }
  return windowStart;
}

/**
 * Determine the [start, end) window for compaction based on the chosen boundary.
 * The end index is exclusive. The final assistant message (last item) is never compacted.
 */
export function detectWindowRange(
  messages: ModelMessage[] | any[],
  boundary: Boundary
): { start: number; endExclusive: number } {
  const len = Array.isArray(messages) ? messages.length : 0;
  if (len <= 1) return { start: 0, endExclusive: 0 };

  // Preserve the first N messages; compact everything after them.
  if (typeof boundary === "object" && boundary.type === "keep-first") {
    const countRaw = boundary.count;
    const n = Number.isFinite(countRaw)
      ? Math.max(0, Math.floor(countRaw as number))
      : 0;
    // Start after the first N messages, end before the final assistant message
    const startIndex = Math.min(n, len - 1);
    return { start: startIndex, endExclusive: Math.max(startIndex, len - 1) };
  }

  // Preserve the last N messages; compact everything before them.
  if (typeof boundary === "object" && boundary.type === "keep-last") {
    const countRaw = boundary.count;
    const n = Number.isFinite(countRaw)
      ? Math.max(0, Math.floor(countRaw as number))
      : 0;
    // Compact from start, end before the last N messages (and before the final assistant message)
    const endExclusive = Math.max(0, Math.min(len - 1, len - n));
    return { start: 0, endExclusive };
  }

  return { start: 0, endExclusive: Math.max(0, len - 1) };
}

/**
 * Options for the write-tool-results-to-file compaction strategy.
 */
export interface WriteToolResultsToFileOptions {
  /** Where to start compacting from in the message list. */
  boundary: Boundary;
  /** File adapter used to resolve keys and write content. */
  adapter: FileAdapter;
  /** Converts tool outputs into strings before writing. Defaults to JSON.stringify. */
  toolResultSerializer: (value: unknown) => string;
  /**
   * Names of tools that READ from previously written storage (e.g., read/search tools).
   * Their results will NOT be re-written; instead a friendly reference to the source is shown.
   * Provide custom names for your own reader/search tools.
   */
  fileReaderTools?: string[];
  /**
   * Optional session ID to organize persisted tool results.
   * Files will be organized as: {baseDir}/{sessionId}/tool-results/{toolName}-{seq}.json
   */
  sessionId?: string;
}

function isToolMessage(msg: any): boolean {
  return msg && msg.role === "tool" && Array.isArray(msg.content);
}

/**
 * Compaction strategy that writes tool-result payloads to storage and replaces their in-line
 * content with a concise reference to the persisted location.
 */
export async function writeToolResultsToFileStrategy(
  messages: ModelMessage[],
  options: WriteToolResultsToFileOptions
): Promise<ModelMessage[]> {
  const msgs = Array.isArray(messages) ? [...messages] : [];

  const lastMessage = msgs[msgs.length - 1] as any;
  const endsWithAssistantText =
    lastMessage &&
    lastMessage.role === "assistant" &&
    messageHasTextContent(lastMessage);
  if (!endsWithAssistantText) return msgs;

  const { start: windowStart, endExclusive } = detectWindowRange(
    msgs,
    options.boundary
  );

  const sessionId = options.sessionId ?? `session-${randomUUID().slice(0, 8)}`;

  for (let i = windowStart; i < Math.min(endExclusive, msgs.length - 1); i++) {
    const msg: any = msgs[i];
    if (!isToolMessage(msg)) continue;

    for (const part of msg.content) {
      if (!part || part.type !== "tool-result" || !part.output) continue;

      // Reference-only behavior for tools that read from storage
      // Note: Only readFile is included. grepAndSearchFile returns computed results
      // (matches) that cannot be recreated, so we persist them instead.
      const defaultFileReaderNames = ["readFile"];
      const configuredNames =
        options.fileReaderTools && options.fileReaderTools.length > 0
          ? options.fileReaderTools
          : defaultFileReaderNames;
      const fileReaderSet = new Set(configuredNames);
      if (part.toolName && fileReaderSet.has(part.toolName)) {
        const output: any = part.output;
        let fileName: string | undefined;
        let key: string | undefined;
        let storage: string | undefined;

        // Try multiple access patterns to find the data
        let outputData = output;

        // If output has a value property, try that first
        if (
          output &&
          typeof output === "object" &&
          output.value !== undefined
        ) {
          outputData = output.value;
        }

        // If output has a text property (AI SDK sometimes uses this), try that
        if (
          outputData &&
          typeof outputData === "object" &&
          outputData.text !== undefined
        ) {
          outputData = outputData.text;
        }

        if (outputData && typeof outputData === "object") {
          if (typeof outputData.fileName === "string") {
            fileName = outputData.fileName;
          }
          if (typeof outputData.key === "string") {
            key = outputData.key;
          }
          if (typeof outputData.storage === "string") {
            storage = outputData.storage;
          }
        }

        const display =
          storage && key
            ? `Read from file: ${formatStoragePathForDisplay(
                storage,
                key
              )}. Key: ${key}`
            : `Read from file: ${fileName ?? "<unknown>"}`;

        part.output = {
          type: "text",
          value: display,
        };

        // No need to register - files are read directly when they exist
        continue;
      }

      // Extract tool output for persistence
      const output: any = part.output;
      let outputValue: any;

      if (output && output.type === "json" && output.value !== undefined) {
        outputValue = output.value;
      } else if (
        output &&
        output.type === "text" &&
        typeof output.text === "string"
      ) {
        outputValue = output.text;
      } else {
        outputValue = output;
      }

      if (!outputValue) continue;

      // Skip if this is already a reference (previously compacted)
      if (typeof outputValue === "string") {
        if (
          outputValue.startsWith("Written to file:") ||
          outputValue.startsWith("Read from file:")
        ) {
          continue;
        }
      } else if (
        output &&
        output.type === "text" &&
        typeof output.value === "string"
      ) {
        if (
          output.value.startsWith("Written to file:") ||
          output.value.startsWith("Read from file:")
        ) {
          continue;
        }
      }

      // Generate file name based on tool name (one file per tool, overwritten on subsequent calls)
      const toolName = part.toolName || "unknown";
      const fileName = `${toolName}.json`;

      // Wrap output with metadata
      const persistedResult: PersistedToolResult = {
        metadata: {
          toolName,
          timestamp: new Date().toISOString(),
          toolCallId: part.toolCallId || randomUUID(),
          sessionId,
        },
        output: outputValue,
      };

      const key = options.adapter.resolveKey(fileName);
      await options.adapter.write({
        key,
        body: JSON.stringify(persistedResult, null, 2),
        contentType: "application/json",
      });

      const adapterUri = options.adapter.toString();
      part.output = {
        type: "text",
        value: `Written to file: ${formatStoragePathForDisplay(
          adapterUri,
          key
        )}. Key: ${key}. Use the read/search tools to inspect its contents.`,
      };
    }
  }

  return msgs;
}
