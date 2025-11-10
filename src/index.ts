// Public API barrel for npm package consumers

// Compaction
export { compactMessages } from "./compact";
export type { CompactOptions } from "./compact";

// File adapter - core
export {
  createFileAdapter,
  resolveFileUriFromBaseDir,
} from "./storage/resolver";
export type {
  FileAdapter,
  FileReadParams,
  FileWriteParams,
  FileWriteResult,
  PersistedToolResult,
  UriOrAdapter,
} from "./storage/types";

// File adapter - implementation
export {
  FileAdapter as FileAdapterClass,
  fileUriToOptions,
} from "./storage/file";
export type { FileAdapterOptions } from "./storage/file";

// Sandbox file adapter
export { SandboxFileAdapter } from "./storage/sandbox-adapter";
export type { SandboxFileAdapterOptions } from "./storage/sandbox-adapter";

// Storage - utilities
export { grepObject } from "./storage/grep";
export type { GrepResultLine } from "./storage/grep";

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
