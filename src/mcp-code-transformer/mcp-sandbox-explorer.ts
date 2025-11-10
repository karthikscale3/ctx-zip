// Main MCPSandboxExplorer class

import { writeFilesToSandbox } from "./file-generator.js";
import { fetchToolDefinitions } from "./mcp-client.js";
import type { SandboxProvider } from "./sandbox-provider.js";
import {
  createExecutionTool,
  createExplorationTools,
} from "./sandbox-tools.js";
import type {
  MCPServerConfig,
  SandboxExplorerConfig,
  ServerToolsMap,
} from "./types.js";
import { VercelSandboxProvider } from "./vercel-sandbox-provider.js";

/**
 * MCPSandboxExplorer - Create a sandboxed environment with MCP tool definitions
 *
 * This class manages:
 * 1. Sandbox initialization (pluggable providers)
 * 2. MCP server connections and tool discovery
 * 3. File system generation in the sandbox
 * 4. AI SDK tools for exploration and execution
 */
export class MCPSandboxExplorer {
  private sandboxProvider: SandboxProvider;
  private servers: MCPServerConfig[];
  private serverToolsMap: ServerToolsMap = {};
  private outputDir: string;

  private constructor(
    sandboxProvider: SandboxProvider,
    servers: MCPServerConfig[],
    outputDir: string
  ) {
    this.sandboxProvider = sandboxProvider;
    this.servers = servers;
    this.outputDir = outputDir;
  }

  /**
   * Create and initialize a new MCPSandboxExplorer instance
   */
  static async create(
    config: SandboxExplorerConfig
  ): Promise<MCPSandboxExplorer> {
    const { servers, sandboxProvider, sandboxOptions = {}, outputDir } = config;

    // Validate config
    if (!servers || servers.length === 0) {
      throw new Error("At least one MCP server must be provided");
    }

    // Use provided sandbox provider or create Vercel sandbox as default
    let provider: SandboxProvider;
    if (sandboxProvider) {
      provider = sandboxProvider;
      console.log("✓ Using provided sandbox provider");
    } else {
      // Default to Vercel sandbox
      provider = await VercelSandboxProvider.create({
        timeout: sandboxOptions.timeout || 1800000,
        runtime:
          (sandboxOptions.runtime as "node22" | "python3.13") || "node22",
        vcpus: sandboxOptions.vcpus || 4,
      });
    }

    // Determine output directory based on provider's workspace
    const workspacePath = provider.getWorkspacePath();
    const finalOutputDir = outputDir || `${workspacePath}/servers`;

    return new MCPSandboxExplorer(provider, servers, finalOutputDir);
  }

  /**
   * Fetch tools from all MCP servers and generate file system
   */
  async generateFileSystem(): Promise<void> {
    console.log(
      `\nFetching tools from ${this.servers.length} MCP server(s)...`
    );

    // Fetch tools from all servers
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
        // Continue with other servers
      }
    }

    const totalTools = Object.values(this.serverToolsMap).reduce(
      (sum, tools) => sum + tools.length,
      0
    );

    if (totalTools === 0) {
      throw new Error("No tools were fetched from any server");
    }

    console.log(`\nGenerating file system with ${totalTools} tools...`);

    // Install required packages in sandbox (including tsx for TypeScript execution)
    console.log("\nInstalling dependencies in sandbox...");
    const npmInstallResult = await this.sandboxProvider.runCommand({
      cmd: "npm",
      args: ["install", "@modelcontextprotocol/sdk@^1.0.4", "tsx", "--no-save"],
    });

    if (npmInstallResult.exitCode === 0) {
      console.log("✓ Dependencies installed (MCP SDK + tsx)");
    } else {
      const stderr = await npmInstallResult.stderr();
      console.warn(`Warning: Failed to install dependencies: ${stderr}`);
    }

    // Write all files to sandbox
    await writeFilesToSandbox(
      this.sandboxProvider,
      this.serverToolsMap,
      this.servers,
      this.outputDir
    );

    console.log(`✓ File system generated at ${this.outputDir}`);

    // Verify file creation
    const lsResult = await this.sandboxProvider.runCommand({
      cmd: "ls",
      args: ["-la", this.outputDir],
    });

    if (lsResult.exitCode === 0) {
      const stdout = await lsResult.stdout();
      console.log(`\nDirectory structure:\n${stdout}`);
    }
  }

  /**
   * Get AI SDK tools for exploring the sandbox file system
   */
  getExplorationTools() {
    return createExplorationTools(this.sandboxProvider, this.outputDir);
  }

  /**
   * Get AI SDK tool for executing code in the sandbox
   */
  getExecutionTool() {
    const workspacePath = this.sandboxProvider.getWorkspacePath();
    const userCodeDir = `${workspacePath}/user-code`;
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
   * Get information about all discovered tools
   */
  getToolsSummary(): {
    totalServers: number;
    totalTools: number;
    servers: Array<{ name: string; toolCount: number; tools: string[] }>;
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
      totalTools: servers.reduce((sum, s) => sum + s.toolCount, 0),
      servers,
    };
  }

  /**
   * Display the complete file system tree structure
   */
  async displayFileSystemTree(): Promise<void> {
    console.log(`\n📂 File System Tree at ${this.outputDir}:`);
    console.log("─".repeat(60));

    // Try to use tree command first, fallback to find
    const treeResult = await this.sandboxProvider.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `command -v tree >/dev/null 2>&1 && tree -L 3 ${this.outputDir} || find ${this.outputDir} -type f -o -type d | sort | sed 's|${this.outputDir}||' | sed 's|^/||' | awk '{depth=split(\$0,a,"/"); for(i=1;i<depth;i++)printf("  "); if(depth>0)print a[depth]}'`,
      ],
    });

    if (treeResult.exitCode === 0) {
      const stdout = await treeResult.stdout();
      console.log(stdout);
    } else {
      // Fallback: simple find output
      const findResult = await this.sandboxProvider.runCommand({
        cmd: "find",
        args: [this.outputDir, "-type", "f"],
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
