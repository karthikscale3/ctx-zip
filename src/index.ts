// Public API barrel for npm package consumers

// Tool Results Compactor
export { compact } from "./tool-results-compactor/index";
export type { Boundary, CompactOptions } from "./tool-results-compactor/index";

// Tools
export { createGrepAndSearchFileTool, createReadFileTool } from "./tools/index";
export type {
  GrepAndSearchFileToolOptions,
  ReadFileToolOptions,
} from "./tools/index";

// Sandbox Code Generator
export {
  E2BSandboxProvider,
  LocalSandboxProvider,
  SandboxManager,
  VercelSandboxProvider,
} from "./sandbox-code-generator/index";
export type {
  E2BSandboxOptions,
  FileAdapter,
  FileReadParams,
  FileWriteParams,
  FileWriteResult,
  LocalFileAdapterOptions,
  LocalSandboxOptions,
  SandboxProvider,
  SandboxProviderOptions,
  ToolCodeGenerationResult,
  VercelSandboxOptions,
} from "./sandbox-code-generator/index";
