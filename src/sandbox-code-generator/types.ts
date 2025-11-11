// Type definitions for MCP Sandbox Explorer

import type { Tool } from "ai";
import type {
  SandboxProvider,
  SandboxProviderOptions,
} from "./sandbox-provider.js";
import type { ToolCodeGenerationOptions } from "./tool-code-writer.js";

export interface MCPServerConfig {
  name: string;
  url: string;
  headers?: Record<string, string>;
  useSSE?: boolean;
}

export interface SandboxManagerConfig {
  /**
   * Custom sandbox provider. If not provided, defaults to LocalSandboxProvider
   */
  sandboxProvider?: SandboxProvider;
  /**
   * Options for the sandbox provider (used if sandboxProvider is not provided)
   */
  sandboxOptions?: SandboxProviderOptions;
}

/**
 * @deprecated Use SandboxManagerConfig instead
 */
export interface SandboxExplorerConfig extends SandboxManagerConfig {
  /**
   * @deprecated Use register() method instead
   */
  servers?: MCPServerConfig[];
  /**
   * @deprecated Use register() method instead
   */
  standardTools?: Record<string, Tool<any, any>>;
  /**
   * @deprecated Use register() method instead
   */
  standardToolOptions?: ToolCodeGenerationOptions;
  /**
   * @deprecated Use register() method instead
   */
  outputDir?: string;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface ServerToolsMap {
  [serverName: string]: ToolDefinition[];
}
