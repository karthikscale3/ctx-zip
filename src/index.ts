// Public API barrel for npm package consumers

// Compaction
export { compactMessages } from "./compact";
export type { CompactOptions } from "./compact";

// Storage - core
export {
  createStorageAdapter,
  resolveFileUriFromBaseDir,
} from "./storage/resolver";
export type {
  StorageAdapter,
  StorageReadParams,
  StorageWriteParams,
  StorageWriteResult,
  UriOrAdapter,
} from "./storage/types";

// Storage - adapters
export { FileStorageAdapter, fileUriToOptions } from "./storage/file";
export {
  VercelBlobStorageAdapter,
  vercelBlobUriToOptions,
} from "./storage/vercelBlob";

// Storage - utilities
export { grepObject } from "./storage/grep";
export type { GrepResultLine } from "./storage/grep";

// Strategies
export {
  detectWindowStart,
  messageHasTextContent,
  writeToolResultsToStorageStrategy,
} from "./strategies/writeToolResultsToStorage";
export type {
  Boundary,
  WriteToolResultsToStorageOptions,
} from "./strategies/writeToolResultsToStorage";

// Tools
export { createGrepAndSearchFileTool, createReadFileTool } from "./tools/index";
export type {
  GrepAndSearchFileToolOptions,
  ReadFileToolOptions,
} from "./tools/index";

// MCP Sandbox Explorer
export {
  createExecutionTool,
  createExplorationTools,
  E2BSandboxProvider,
  LocalSandboxProvider,
  MCPSandboxExplorer,
  VercelSandboxProvider,
} from "./mcp-sandbox/index";
export type {
  CommandResult,
  E2BSandboxOptions,
  LocalSandboxOptions,
  MCPServerConfig,
  SandboxCommand,
  SandboxExplorerConfig,
  SandboxFile,
  SandboxProvider,
  SandboxProviderOptions,
  ServerToolsMap,
  ToolDefinition,
} from "./mcp-sandbox/index";
