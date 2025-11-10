// Type definitions for MCP Sandbox Explorer

import type {
  SandboxProvider,
  SandboxProviderOptions,
} from "./sandbox-provider.js";

export interface MCPServerConfig {
  name: string;
  url: string;
  headers?: Record<string, string>;
  useSSE?: boolean;
}

export interface SandboxExplorerConfig {
  servers: MCPServerConfig[];
  /**
   * Custom sandbox provider. If not provided, defaults to VercelSandboxProvider
   */
  sandboxProvider?: SandboxProvider;
  /**
   * Options for the sandbox provider (used if sandboxProvider is not provided)
   */
  sandboxOptions?: SandboxProviderOptions;
  /**
   * Directory where MCP tool files will be generated.
   * If not provided, defaults to `{workspacePath}/servers` where workspacePath
   * comes from the sandbox provider.
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
