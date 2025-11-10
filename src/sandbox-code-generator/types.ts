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

export interface SandboxExplorerConfig {
  /**
   * MCP servers to fetch tools from.
   */
  servers?: MCPServerConfig[];
  /**
   * Regular AI SDK tools to transform into sandbox code.
   */
  standardTools?: Record<string, Tool<any, any>>;
  /**
   * Options for regular AI SDK tool code generation.
   */
  standardToolOptions?: ToolCodeGenerationOptions;
  /**
   * Custom sandbox provider. If not provided, defaults to LocalSandboxProvider
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
