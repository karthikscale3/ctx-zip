/**
 * Local MCP Search Example - Debugging with Local Filesystem
 *
 * This example uses LocalSandboxProvider to write files to ./.sandbox
 * and run commands locally. This helps debug MCP client code without
 * E2B complexity.
 *
 * Benefits:
 * - Inspect generated files directly in .sandbox/
 * - See real-time console output
 * - Faster iteration for debugging
 * - No cloud sandbox required
 */

import { generateText, stepCountIs } from "ai";
import dotenv from "dotenv";
import {
  LocalSandboxProvider,
  MCPSandboxExplorer,
} from "../../src/mcp-sandbox/index.js";

dotenv.config();

async function main() {
  console.log("🚀 Starting Local MCP Sandbox Example\n");

  // Create local sandbox provider
  // Files will be written to ./.sandbox directory
  const sandboxProvider = await LocalSandboxProvider.create({
    sandboxDir: "./.sandbox",
    cleanOnCreate: true,
  });

  console.log(`\n📁 Sandbox location: ${sandboxProvider.getAbsolutePath()}\n`);

  try {
    // Initialize the explorer with MCP server (grep.app for GitHub search)
    const explorer = await MCPSandboxExplorer.create({
      sandboxProvider,
      servers: [
        {
          name: "grep-app",
          url: "https://mcp.grep.app",
        },
      ],
    });

    // Generate the file system with tool definitions
    console.log("\n📝 Generating MCP tool files...");
    await explorer.generateFileSystem();

    // Display the file system tree
    await explorer.displayFileSystemTree();

    // Get tools summary
    const summary = explorer.getToolsSummary();
    console.log("\n📊 Tools Summary:");
    console.log(`  Total Servers: ${summary.totalServers}`);
    console.log(`  Total Tools: ${summary.totalTools}`);
    for (const server of summary.servers) {
      console.log(`\n  ${server.name}:`);
      console.log(
        `    Tools (${server.toolCount}): ${server.tools.join(", ")}`
      );
    }

    console.log(
      `\n💡 TIP: You can inspect the generated files at: ${sandboxProvider.getAbsolutePath()}\n`
    );

    // Get AI SDK tools for the agent
    const tools = explorer.getAllTools();

    console.log("\n🤖 Starting AI agent to test MCP tools...\n");

    const workspacePath = sandboxProvider.getWorkspacePath();
    const serversDir = `${workspacePath}/servers`;
    const userCodeDir = `${workspacePath}/user-code`;

    // Let the AI use the MCP tools
    const result = await generateText({
      model: "openai/gpt-4.1-mini",
      stopWhen: stepCountIs(10),
      tools,
      onStepFinish: ({ text, toolCalls, toolResults }) => {
        console.log("\n" + "=".repeat(80));
        if (text) {
          console.log(`💭 Reasoning: ${text.substring(0, 200)}...`);
        }
        if (toolCalls && toolCalls.length > 0) {
          console.log(
            `🔧 Tool Calls: ${toolCalls.map((c) => c.toolName).join(", ")}`
          );
        }
        console.log("=".repeat(80) + "\n");
      },
      system:
        "You are a coding agent testing MCP tools in a local sandbox. Use sandbox_cat to read files, then sandbox_exec to run TypeScript code.",
      prompt: `Test the grep.app MCP server by searching GitHub for "langtrace" in TypeScript files.

Available in local sandbox at ${serversDir}:
- grep-app: searchGitHub tool

Steps:
1. Read ${serversDir}/README.md to see available tools
2. Read ${serversDir}/grep-app/searchGitHub.ts to understand the API
3. Write a TypeScript script using sandbox_exec that:
   - Imports: import { searchGitHub } from '../servers/grep-app/index.ts';
   - Calls searchGitHub with query: "langtrace" and language filter: "TypeScript"
   - Logs the results with JSON.stringify
   - Has proper error handling with try/catch
   - Uses: main().catch(console.error); pattern

CRITICAL: 
- Use .ts extensions in imports
- Wrap everything in async function main()
- Add console.log before and after the searchGitHub call
- Save the file to ${userCodeDir}`,
    });

    console.log("\n📝 Final Result:");
    console.log(result.text);

    console.log("\n\n🔍 Tool Calls Made:");
    for (const step of result.steps) {
      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const toolCall of step.toolCalls) {
          console.log(`  - ${toolCall.toolName}`);
        }
      }
    }

    console.log(
      `\n💾 All generated files are available at: ${sandboxProvider.getAbsolutePath()}`
    );
    console.log(
      `   You can inspect, edit, and run them manually for debugging.\n`
    );
  } finally {
    // Cleanup (no-op for local, files remain)
    await sandboxProvider.stop();
  }

  console.log("\n✨ Example completed!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
