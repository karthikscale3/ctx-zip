// Utility functions for quickly setting up sandboxes in code mode
// Code mode transforms MCP servers and tools into executable code that runs in the sandbox

import type { Tool } from "ai";
import {
  LocalSandboxProvider,
  type LocalSandboxOptions,
} from "./local-sandbox-provider.js";
import { SandboxManager } from "./sandbox-manager.js";
import type { ToolCodeGenerationOptions } from "./tool-code-writer.js";
import type { MCPServerConfig } from "./types.js";
import {
  VercelSandboxProvider,
  type VercelSandboxOptions,
} from "./vercel-sandbox-provider.js";

// Lazy import types - these are only imported when needed
import type { E2BSandboxOptions } from "./e2b-sandbox-provider.js";

/**
 * Options for creating a sandbox in code mode
 * Code mode transforms MCP servers and tools into executable code that runs in the sandbox
 */
export interface SandboxCodeModeOptions {
  /**
   * Sandbox provider options (specific to each provider type)
   * Optional - sensible defaults are applied automatically
   */
  sandboxOptions?:
    | VercelSandboxOptions
    | E2BSandboxOptions
    | LocalSandboxOptions;
  /**
   * MCP servers to register
   */
  servers?: MCPServerConfig[];
  /**
   * Standard AI SDK tools to register
   */
  standardTools?: Record<string, Tool<any, any>>;
  /**
   * Options for standard tool code generation
   */
  standardToolOptions?: ToolCodeGenerationOptions;
}

/**
 * Result of creating a sandbox in code mode
 */
export interface SandboxCodeModeResult {
  /**
   * All available tools (exploration + execution)
   */
  tools: Record<string, Tool<any, any>>;
  /**
   * The sandbox manager instance (for cleanup and advanced operations)
   */
  manager: SandboxManager;
}

/**
 * Create a Vercel sandbox in code mode
 * Transforms MCP servers and tools into executable code that runs in the sandbox
 *
 * Default sandbox settings:
 * - timeout: 1800000ms (30 minutes)
 * - runtime: "node22"
 * - vcpus: 4
 *
 * @param options - Configuration options (sandboxOptions are optional with sensible defaults)
 * @returns Tools and manager instance
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const { tools, manager } = await createVercelSandboxCodeMode({
 *   servers: [
 *     {
 *       name: "vercel",
 *       url: "https://mcp.vercel.com",
 *       headers: { Authorization: `Bearer ${process.env.VERCEL_API_KEY}` },
 *     },
 *   ],
 * });
 *
 * // Custom sandbox options (optional)
 * const { tools, manager } = await createVercelSandboxCodeMode({
 *   sandboxOptions: {
 *     timeout: 3600000, // 1 hour
 *     vcpus: 8,
 *   },
 *   servers: [...],
 * });
 * ```
 */
export async function createVercelSandboxCodeMode(
  options: SandboxCodeModeOptions = {}
): Promise<SandboxCodeModeResult> {
  const {
    sandboxOptions = {},
    servers = [],
    standardTools = {},
    standardToolOptions,
  } = options;

  // Validate required environment variable
  if (!process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      "VERCEL_OIDC_TOKEN environment variable is required for Vercel sandbox. Please set it before creating a Vercel sandbox."
    );
  }

  // Create Vercel sandbox provider with defaults
  const sandboxProvider = await VercelSandboxProvider.create({
    timeout: 1800000, // 30 minutes default
    runtime: "node22",
    vcpus: 4,
    ...sandboxOptions,
  } as VercelSandboxOptions);

  // Initialize SandboxManager
  const manager = await SandboxManager.create({
    sandboxProvider,
  });

  // Register servers and standard tools
  if (servers.length > 0 || Object.keys(standardTools).length > 0) {
    await manager.register({
      servers,
      standardTools,
      standardToolOptions,
    });
  }

  // Get all tools
  const tools = manager.getAllTools();

  return { tools, manager };
}

/**
 * Create an E2B sandbox in code mode
 * Transforms MCP servers and tools into executable code that runs in the sandbox
 *
 * Default sandbox settings:
 * - timeout: 1800000ms (30 minutes)
 *
 * @param options - Configuration options (sandboxOptions are optional with sensible defaults)
 * @returns Tools and manager instance
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const { tools, manager } = await createE2BSandboxCodeMode({
 *   servers: [
 *     {
 *       name: "my-server",
 *       url: "https://mcp.example.com",
 *     },
 *   ],
 * });
 *
 * // Custom sandbox options (optional)
 * const { tools, manager } = await createE2BSandboxCodeMode({
 *   sandboxOptions: {
 *     timeout: 3600000,
 *     template: "base",
 *   },
 *   servers: [...],
 * });
 * ```
 */
export async function createE2BSandboxCodeMode(
  options: SandboxCodeModeOptions = {}
): Promise<SandboxCodeModeResult> {
  const {
    sandboxOptions = {},
    servers = [],
    standardTools = {},
    standardToolOptions,
  } = options;

  // Lazy import E2B provider to avoid loading it when not needed
  const { E2BSandboxProvider } = await import("./e2b-sandbox-provider.js");

  // Validate required environment variable (check both options and env)
  const apiKey =
    (sandboxOptions as E2BSandboxOptions).apiKey || process.env.E2B_API_KEY;
  if (!apiKey) {
    throw new Error(
      "E2B_API_KEY environment variable is required for E2B sandbox. Please set it before creating an E2B sandbox, or provide it via sandboxOptions.apiKey."
    );
  }

  // Create E2B sandbox provider with defaults
  const sandboxProvider = await E2BSandboxProvider.create({
    timeout: 1800000, // 30 minutes default
    ...sandboxOptions,
  } as E2BSandboxOptions);

  // Initialize SandboxManager
  const manager = await SandboxManager.create({
    sandboxProvider,
  });

  // Register servers and standard tools
  if (servers.length > 0 || Object.keys(standardTools).length > 0) {
    await manager.register({
      servers,
      standardTools,
      standardToolOptions,
    });
  }

  // Get all tools
  const tools = manager.getAllTools();

  return { tools, manager };
}

/**
 * Create a local sandbox in code mode
 * Transforms MCP servers and tools into executable code that runs in the sandbox
 *
 * Default sandbox settings:
 * - sandboxDir: "./.sandbox"
 * - cleanOnCreate: true
 *
 * @param options - Configuration options (sandboxOptions are optional with sensible defaults)
 * @returns Tools and manager instance
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const { tools, manager } = await createLocalSandboxCodeMode({
 *   servers: [
 *     {
 *       name: "my-server",
 *       url: "https://mcp.example.com",
 *     },
 *   ],
 * });
 *
 * // Custom sandbox options (optional)
 * const { tools, manager } = await createLocalSandboxCodeMode({
 *   sandboxOptions: {
 *     sandboxDir: "./custom-sandbox",
 *     cleanOnCreate: false,
 *   },
 *   servers: [...],
 * });
 * ```
 */
export async function createLocalSandboxCodeMode(
  options: SandboxCodeModeOptions = {}
): Promise<SandboxCodeModeResult> {
  const {
    sandboxOptions = {},
    servers = [],
    standardTools = {},
    standardToolOptions,
  } = options;

  // Create local sandbox provider with defaults
  const sandboxProvider = await LocalSandboxProvider.create({
    sandboxDir: "./.sandbox",
    cleanOnCreate: true,
    ...sandboxOptions,
  } as LocalSandboxOptions);

  // Initialize SandboxManager
  const manager = await SandboxManager.create({
    sandboxProvider,
  });

  // Register servers and standard tools
  if (servers.length > 0 || Object.keys(standardTools).length > 0) {
    await manager.register({
      servers,
      standardTools,
      standardToolOptions,
    });
  }

  // Get all tools
  const tools = manager.getAllTools();

  return { tools, manager };
}
