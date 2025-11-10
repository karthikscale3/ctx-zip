// Public API barrel for npm package consumers

// Tool Results Compactor
export {
  compactMessages,
  createFileAdapter,
  detectWindowStart,
  FileAdapterClass,
  fileUriToOptions,
  grepObject,
  messageHasTextContent,
  resolveFileUriFromBaseDir,
  SandboxFileAdapter,
  writeToolResultsToFileStrategy,
} from "./tool-results-compactor/index";
export type {
  Boundary,
  CompactOptions,
  FileAdapter,
  FileAdapterOptions,
  FileReadParams,
  FileWriteParams,
  FileWriteResult,
  GrepResultLine,
  PersistedToolResult,
  SandboxFileAdapterOptions,
  UriOrAdapter,
  WriteToolResultsToFileOptions,
} from "./tool-results-compactor/index";

// Tools
export { createGrepAndSearchFileTool, createReadFileTool } from "./tools/index";
export type {
  GrepAndSearchFileToolOptions,
  ReadFileToolOptions,
} from "./tools/index";

// MCP Code Transformer
export {
  createExecutionTool,
  createExplorationTools,
  E2BSandboxProvider,
  LocalSandboxProvider,
  MCPSandboxExplorer,
  VercelSandboxProvider,
} from "./mcp-code-transformer/index";
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
} from "./mcp-code-transformer/index";
