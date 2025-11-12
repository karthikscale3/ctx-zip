// SandboxManager - unified sandbox environment for MCP and standard tools

import type { Tool } from "ai";
import {
  LocalFileAdapter,
  SandboxFileAdapter,
  type FileAdapter,
  type LocalFileAdapterOptions,
} from "./file-adapter.js";
import { writeFilesToSandbox, writeUserCodeREADME } from "./file-generator.js";
import {
  LocalSandboxProvider,
  type LocalSandboxOptions,
} from "./local-sandbox-provider.js";
import { fetchToolDefinitions } from "./mcp-client.js";
import type { SandboxProvider } from "./sandbox-provider.js";
import {
  createExecutionTool,
  createExplorationTools,
} from "./sandbox-tools.js";
import {
  writeToolsToSandbox,
  type ToolCodeGenerationOptions,
  type ToolCodeGenerationResult,
} from "./tool-code-writer.js";
import type {
  MCPServerConfig,
  SandboxManagerConfig,
  ServerToolsMap,
} from "./types.js";

export class SandboxManager {
  private readonly sandboxProvider: SandboxProvider;
  private readonly workspacePath: string;
  private readonly explorationRoot: string;

  private readonly mcpDir: string;
  private readonly localToolsDir: string;
  private readonly userCodeDir: string;
  private readonly compactDir: string;

  private serverToolsMap: ServerToolsMap = {};
  private standardToolsResult?: ToolCodeGenerationResult;

  private constructor(sandboxProvider: SandboxProvider) {
    this.sandboxProvider = sandboxProvider;
    this.workspacePath = sandboxProvider.getWorkspacePath();
    this.explorationRoot = this.workspacePath;

    // Define the four standard directories
    this.mcpDir = `${this.workspacePath}/mcp`;
    this.localToolsDir = `${this.workspacePath}/local-tools`;
    this.userCodeDir = `${this.workspacePath}/user-code`;
    this.compactDir = `${this.workspacePath}/compact`;
  }

  /**
   * Create a local file adapter for writing to the local filesystem (no sandbox).
   * Use this for local development/testing without a sandbox provider.
   * By default, files are written to the compact directory.
   *
   * @param options - Configuration for the local file adapter
   * @param options.baseDir - The base directory path
   * @param options.prefix - Optional subdirectory prefix (defaults to "compact")
   * @param options.sessionId - Optional session ID for organizing files
   * @returns A FileAdapter instance for local filesystem operations
   */
  static createLocalFileAdapter(options: LocalFileAdapterOptions): FileAdapter {
    return new LocalFileAdapter(options);
  }

  /**
   * Create and initialize a new SandboxManager instance with the base directory structure
   */
  static async create(
    config: SandboxManagerConfig = {}
  ): Promise<SandboxManager> {
    const { sandboxProvider, sandboxOptions = {} } = config;

    let provider: SandboxProvider;
    if (sandboxProvider) {
      provider = sandboxProvider;
      console.log("✓ Using provided sandbox provider");
    } else {
      const options = sandboxOptions as LocalSandboxOptions;
      provider = await LocalSandboxProvider.create(options);
      console.log("✓ Using local sandbox provider (default)");
    }

    const manager = new SandboxManager(provider);

    // Create the four standard directories
    console.log("\n🔧 Initializing sandbox directories...");
    await manager.createDirectoryStructure();
    console.log("✓ Sandbox directory structure initialized");

    return manager;
  }

  /**
   * Create the standard directory structure (servers, local-tools, user-code, compact)
   */
  private async createDirectoryStructure(): Promise<void> {
    const dirs = [
      this.mcpDir,
      this.localToolsDir,
      this.userCodeDir,
      this.compactDir,
    ];

    for (const dir of dirs) {
      const mkdirResult = await this.sandboxProvider.runCommand({
        cmd: "mkdir",
        args: ["-p", dir],
      });

      if (mkdirResult.exitCode !== 0) {
        const stderr = await mkdirResult.stderr();
        throw new Error(`Failed to create directory ${dir}: ${stderr}`);
      }
    }

    // Generate README for user-code directory with instructions
    await writeUserCodeREADME(this.sandboxProvider, this.userCodeDir);
  }

  /**
   * Register MCP servers and/or standard tools for transformation and writing to appropriate directories
   */
  async register(options: {
    servers?: MCPServerConfig[];
    standardTools?: Record<string, Tool<any, any>>;
    standardToolOptions?: ToolCodeGenerationOptions;
  }): Promise<void> {
    const { servers = [], standardTools = {}, standardToolOptions } = options;

    if (servers.length === 0 && Object.keys(standardTools).length === 0) {
      console.warn("⚠️  No servers or standard tools provided to register().");
      return;
    }

    // Process MCP servers
    if (servers.length > 0) {
      console.log(`\nFetching tools from ${servers.length} MCP server(s)...`);

      for (const server of servers) {
        try {
          console.log(`  Connecting to ${server.name}...`);
          const tools = await fetchToolDefinitions(server);
          this.serverToolsMap[server.name] = tools;
          console.log(`  ✓ Found ${tools.length} tools from ${server.name}`);
        } catch (error) {
          console.error(
            `  ✗ Failed to fetch tools from ${server.name}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      const totalTools = Object.values(this.serverToolsMap).reduce(
        (sum, tools) => sum + tools.length,
        0
      );

      if (totalTools > 0) {
        console.log(
          `\nGenerating file system with ${totalTools} MCP tool(s)...`
        );

        console.log("\nInstalling MCP dependencies in sandbox...");
        const npmInstallResult = await this.sandboxProvider.runCommand({
          cmd: "npm",
          args: [
            "install",
            "@modelcontextprotocol/sdk@^1.0.4",
            "tsx",
            "--no-save",
          ],
        });

        if (npmInstallResult.exitCode === 0) {
          console.log("✓ Dependencies installed (MCP SDK + tsx)");
        } else {
          const stderr = await npmInstallResult.stderr();
          console.warn(`Warning: Failed to install dependencies: ${stderr}`);
        }

        await writeFilesToSandbox(
          this.sandboxProvider,
          this.serverToolsMap,
          servers,
          this.mcpDir
        );

        console.log(`✓ MCP tool file system generated at ${this.mcpDir}`);
      } else {
        console.warn(
          "⚠️  No MCP tools were fetched from the provided servers."
        );
      }
    }

    // Process standard tools
    if (Object.keys(standardTools).length > 0) {
      console.log("\nGenerating source files for standard AI SDK tools...");
      this.standardToolsResult = await writeToolsToSandbox(
        this.sandboxProvider,
        standardTools,
        {
          ...standardToolOptions,
          outputDir: this.localToolsDir,
        }
      );
      console.log(
        `✓ Generated ${this.standardToolsResult.files.length} file(s) at ${this.standardToolsResult.outputDir}`
      );
    }
  }

  /**
   * Get AI SDK tools for exploring the sandbox file system
   */
  getExplorationTools() {
    return createExplorationTools(this.sandboxProvider, this.explorationRoot);
  }

  /**
   * Get AI SDK tools for exploring compacted files in the sandbox.
   * These tools default to the workspace root, making it easy to use
   * the exact paths provided in compaction messages.
   */
  getCompactionTools() {
    return createExplorationTools(this.sandboxProvider, this.workspacePath);
  }

  /**
   * Get AI SDK tool for executing code in the sandbox
   */
  getExecutionTool() {
    return createExecutionTool(this.sandboxProvider, this.userCodeDir);
  }

  /**
   * Get both exploration and execution tools
   */
  getAllTools() {
    return {
      ...this.getExplorationTools(),
      ...this.getExecutionTool(),
    };
  }

  /**
   * Get the sandbox provider instance (for advanced use cases)
   */
  getSandboxProvider(): SandboxProvider {
    return this.sandboxProvider;
  }

  /**
   * Get the path to the servers directory
   */
  getMcpDir(): string {
    return this.mcpDir;
  }

  /**
   * Get the path to the local-tools directory
   */
  getLocalToolsDir(): string {
    return this.localToolsDir;
  }

  /**
   * Get the path to the user-code directory
   */
  getUserCodeDir(): string {
    return this.userCodeDir;
  }

  /**
   * Get the path to the compact directory (for compacted messages)
   */
  getCompactDir(): string {
    return this.compactDir;
  }

  /**
   * Get the workspace path
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Get a file adapter for reading/writing files in the sandbox.
   * By default, files are written to the compact directory.
   * Useful for tool result compaction and other file operations.
   *
   * @param options - Optional configuration for the file adapter
   * @param options.prefix - Optional subdirectory prefix inside sandbox workspace (defaults to "compact")
   * @param options.sessionId - Optional session ID for organizing files (creates sessionId/tool-results/ structure)
   */
  getFileAdapter(options?: {
    prefix?: string;
    sessionId?: string;
  }): FileAdapter {
    return new SandboxFileAdapter({
      sandboxProvider: this.sandboxProvider,
      prefix: options?.prefix ?? "compact",
      sessionId: options?.sessionId,
    });
  }

  /**
   * Get the server tools map
   */
  getServerToolsMap(): ServerToolsMap {
    return this.serverToolsMap;
  }

  /**
   * Get the result of standard tool generation (if any)
   */
  getStandardToolsResult(): ToolCodeGenerationResult | undefined {
    return this.standardToolsResult;
  }

  /**
   * Get information about all discovered tools
   */
  getToolsSummary(): {
    totalServers: number;
    totalMcpTools: number;
    servers: Array<{ name: string; toolCount: number; tools: string[] }>;
    localTools: string[];
  } {
    const servers = Object.entries(this.serverToolsMap).map(
      ([name, tools]) => ({
        name,
        toolCount: tools.length,
        tools: tools.map((t) => t.name),
      })
    );

    const localTools = this.standardToolsResult
      ? this.standardToolsResult.tools.map((t) => t.name)
      : [];

    return {
      totalServers: servers.length,
      totalMcpTools: servers.reduce((sum, s) => sum + s.toolCount, 0),
      servers,
      localTools,
    };
  }

  /**
   * Display the complete file system tree structure
   */
  async displayFileSystemTree(): Promise<void> {
    console.log(`\n📂 Sandbox File System Tree at ${this.workspacePath}:`);
    console.log("─".repeat(60));

    const treeCommand = `command -v tree >/dev/null 2>&1 && tree -L 3 ${this.workspacePath} || find ${this.workspacePath} -type f -o -type d | sort | sed 's|${this.workspacePath}||' | sed 's|^/||' | awk '{depth=split($0,a,\"/\"); for(i=1;i<depth;i++)printf(\"  \"); if(depth>0)print a[depth]}'`;

    const treeResult = await this.sandboxProvider.runCommand({
      cmd: "sh",
      args: ["-c", treeCommand],
    });

    if (treeResult.exitCode === 0) {
      const stdout = await treeResult.stdout();
      console.log(stdout);
    } else {
      const findResult = await this.sandboxProvider.runCommand({
        cmd: "find",
        args: [this.workspacePath, "-type", "f"],
      });
      if (findResult.exitCode === 0) {
        const stdout = await findResult.stdout();
        console.log(stdout);
      }
    }
    console.log("─".repeat(60));
  }

  /**
   * Clean up resources (close sandbox)
   */
  async cleanup(): Promise<void> {
    console.log("\nCleaning up...");
    try {
      await this.sandboxProvider.stop();
      console.log("✓ Sandbox stopped");
    } catch (error) {
      console.error(
        `Warning: Error stopping sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
