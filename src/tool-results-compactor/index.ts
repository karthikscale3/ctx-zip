// Tool Results Compactor - Public API

// Core compaction
export { compactMessages } from "./compact";
export type { CompactOptions } from "./compact";

// File adapter - core
export {
  createFileAdapter,
  resolveFileUriFromBaseDir,
} from "./file-adapters/resolver";
export type {
  FileAdapter,
  FileReadParams,
  FileWriteParams,
  FileWriteResult,
  PersistedToolResult,
  UriOrAdapter,
} from "./file-adapters/types";

// File adapter - implementation
export {
  FileAdapter as FileAdapterClass,
  fileUriToOptions,
} from "./file-adapters/file";
export type { FileAdapterOptions } from "./file-adapters/file";

// Sandbox file adapter
export { SandboxFileAdapter } from "./file-adapters/sandbox-adapter";
export type { SandboxFileAdapterOptions } from "./file-adapters/sandbox-adapter";

// File adapter - utilities
export { grepObject } from "./file-adapters/grep";
export type { GrepResultLine } from "./file-adapters/grep";

// Strategies
export {
  detectWindowStart,
  messageHasTextContent,
  writeToolResultsToFileStrategy,
} from "./strategies/writeToolResultsToFile";
export type {
  Boundary,
  WriteToolResultsToFileOptions,
} from "./strategies/writeToolResultsToFile";
