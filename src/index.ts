// Public API barrel for npm package consumers

// Tool Results Compactor
export { compact } from "./tool-results-compactor/index.js";
export type {
  Boundary,
  CompactOptions,
} from "./tool-results-compactor/index.js";

// Sandbox Code Generator
export {
  E2BSandboxProvider,
  LocalSandboxProvider,
  SANDBOX_SYSTEM_PROMPT,
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
