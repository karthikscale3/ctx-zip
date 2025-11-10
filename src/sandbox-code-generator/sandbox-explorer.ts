// SandboxExplorer - unified sandbox environment for MCP and standard tools

import type { Tool } from "ai";
import { writeFilesToSandbox } from "./file-generator.js";
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
  SandboxExplorerConfig,
  ServerToolsMap,
} from "./types.js";

export class SandboxExplorer {
  private readonly sandboxProvider: SandboxProvider;
  private readonly servers: MCPServerConfig[];
  private readonly standardTools: Record<string, Tool<any, any>>;
  private readonly standardToolOptions?: ToolCodeGenerationOptions;

  private readonly workspacePath: string;
  private readonly explorationRoot: string;

  private mcpOutputDir?: string;
  private standardToolsResult?: ToolCodeGenerationResult;
  private serverToolsMap: ServerToolsMap = {};

  private constructor(
    sandboxProvider: SandboxProvider,
    options: {
      servers: MCPServerConfig[];
      mcpOutputDir?: string;
      standardTools: Record<string, Tool<any, any>>;
      standardToolOptions?: ToolCodeGenerationOptions;
    }
  ) {
    this.sandboxProvider = sandboxProvider;
    this.workspacePath = sandboxProvider.getWorkspacePath();
    this.explorationRoot = this.workspacePath;

    this.servers = options.servers;
    this.mcpOutputDir = options.mcpOutputDir;
    this.standardTools = options.standardTools;
    this.standardToolOptions = options.standardToolOptions;
  }

  /**
   * Create and initialize a new SandboxExplorer instance
   */
  static async create(config: SandboxExplorerConfig): Promise<SandboxExplorer> {
    const {
      servers = [],
      standardTools = {},
      standardToolOptions,
      sandboxProvider,
      sandboxOptions = {},
      outputDir,
    } = config;

    if (servers.length === 0 && Object.keys(standardTools).length === 0) {
      throw new Error(
        "SandboxExplorer requires at least one MCP server or one standard tool."
      );
    }

    let provider: SandboxProvider;
    if (sandboxProvider) {
      provider = sandboxProvider;
      console.log("✓ Using provided sandbox provider");
    } else {
      const options = sandboxOptions as LocalSandboxOptions;
      provider = await LocalSandboxProvider.create(options);
      console.log("✓ Using local sandbox provider (default)");
    }

    const workspacePath = provider.getWorkspacePath();
    const mcpOutputDir = outputDir || `${workspacePath}/servers`;

    return new SandboxExplorer(provider, {
      servers,
      mcpOutputDir,
      standardTools,
      standardToolOptions,
    });
  }

  /**
   * Fetch MCP tools, write local tools, and generate sandbox workspace
   */
  async generateFileSystem(): Promise<void> {
    if (this.servers.length > 0) {
      console.log(
        `\nFetching tools from ${this.servers.length} MCP server(s)...`
      );

      for (const server of this.servers) {
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

        const outputDir = this.mcpOutputDir ?? `${this.workspacePath}/servers`;
        this.mcpOutputDir = outputDir;

        await writeFilesToSandbox(
          this.sandboxProvider,
          this.serverToolsMap,
          this.servers,
          outputDir
        );

        console.log(`✓ MCP tool file system generated at ${outputDir}`);
      } else {
        console.warn(
          "⚠️  No MCP tools were fetched from the provided servers."
        );
      }
    }

    if (Object.keys(this.standardTools).length > 0) {
      console.log("\nGenerating source files for standard AI SDK tools...");
      this.standardToolsResult = await writeToolsToSandbox(
        this.sandboxProvider,
        this.standardTools,
        this.standardToolOptions
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
   * Get AI SDK tool for executing code in the sandbox
   */
  getExecutionTool() {
    const userCodeDir = `${this.workspacePath}/user-code`;
    return createExecutionTool(this.sandboxProvider, userCodeDir);
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
    standardTools: string[];
  } {
    const servers = Object.entries(this.serverToolsMap).map(
      ([name, tools]) => ({
        name,
        toolCount: tools.length,
        tools: tools.map((t) => t.name),
      })
    );

    return {
      totalServers: servers.length,
      totalMcpTools: servers.reduce((sum, s) => sum + s.toolCount, 0),
      servers,
      standardTools: Object.keys(this.standardTools),
    };
  }

  /**
   * Display the complete file system tree structure
   */
  async displayFileSystemTree(): Promise<void> {
    const targetDir =
      this.mcpOutputDir ??
      this.standardToolsResult?.outputDir ??
      this.workspacePath;

    console.log(`\n📂 File System Tree at ${targetDir}:`);
    console.log("─".repeat(60));

    const treeCommand = `command -v tree >/dev/null 2>&1 && tree -L 3 ${targetDir} || find ${targetDir} -type f -o -type d | sort | sed 's|${targetDir}||' | sed 's|^/||' | awk '{depth=split($0,a,\"/\"); for(i=1;i<depth;i++)printf(\"  \"); if(depth>0)print a[depth]}'`;

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
        args: [targetDir, "-type", "f"],
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
