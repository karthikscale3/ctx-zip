// Example: MCP Sandbox Explorer with E2B and grep.app
// This demonstrates searching GitHub using E2B as the sandbox provider

import { generateText, stepCountIs } from "ai";
import dotenv from "dotenv";
import {
  E2BSandboxProvider,
  MCPSandboxExplorer,
} from "../../src/mcp-sandbox/index.js";

// Load environment variables
dotenv.config();

async function main() {
  console.log("🚀 Starting E2B MCP Search Example\n");

  // Create E2B sandbox provider
  const sandboxProvider = await E2BSandboxProvider.create({
    timeout: 1800000, // 30 minutes
  });

  try {
    // Initialize MCPSandboxExplorer with E2B provider and grep-app
    const explorer = await MCPSandboxExplorer.create({
      sandboxProvider,
      servers: [
        {
          name: "grep-app",
          url: "https://mcp.grep.app",
        },
      ],
    });

    // Generate the file system with MCP tool definitions
    await explorer.generateFileSystem();

    // Get all tools
    const tools = explorer.getAllTools();

    console.log("\n🤖 Starting AI agent to search GitHub...\n");

    // Simple trajectory tracking
    let stepCount = 0;
    const toolCalls: string[] = [];

    const serversDir = `${sandboxProvider.getWorkspacePath()}/servers`;
    const userCodeDir = `${sandboxProvider.getWorkspacePath()}/user-code`;

    // Let the AI search GitHub
    const result = await generateText({
      stopWhen: stepCountIs(10),
      model: "openai/gpt-4.1-mini",
      tools,
      onStepFinish: (step) => {
        stepCount++;
        const { toolCalls: calls } = step;

        console.log(`\n📍 Step ${stepCount}`);

        if (calls && calls.length > 0) {
          calls.forEach((call) => {
            const toolName = call.toolName;
            const args = (call as any).args || {};
            toolCalls.push(toolName);
            console.log(`   🔧 ${toolName}`);
            console.log(
              `   📝 Args: ${JSON.stringify(args, null, 2).substring(0, 200)}`
            );
          });
        }
      },
      prompt: `You have access to an E2B sandbox with GitHub search tools at ${serversDir}.

Your task: Search GitHub for "langtrace" usage in TypeScript files

STEPS:
1. **Read the README** at ${serversDir}/README.md to understand available tools
   - MUST use: sandbox_cat with file: "${serversDir}/README.md"

2. **Read the searchGitHub tool definition** to understand parameters
   - Use: sandbox_cat with the full path to the tool file

3. **Write a search script** in ${userCodeDir} that:
   - Imports searchGitHub from '../servers/grep-app/index.ts'
   - Searches for "langtrace" in TypeScript files
   - Prints the top 10 results with:
     * Repository name
     * File path
     * Code snippet (first 5 lines)
   - IMPORTANT: Use .ts extensions for imports

4. **Execute the script** using sandbox_exec with the code parameter

5. **Display results** - make sure to print the actual search results!

CRITICAL RULES:
⚠️  ALWAYS provide required parameters:
  - sandbox_cat REQUIRES "file" parameter (full path)
  - sandbox_exec REQUIRES "code" parameter (TypeScript code)
  - NEVER call tools with empty {} parameters

Show me the actual search results!`,
    });

    console.log("\n\n" + "=".repeat(80));
    console.log("📊 RESULTS");
    console.log("=".repeat(80));
    console.log(`\nTotal Steps: ${stepCount}`);
    console.log(`Tool Calls: ${toolCalls.join(", ")}`);
    console.log("\n📝 Agent Response:");
    console.log(result.text);
    console.log("\n" + "=".repeat(80));

    // Copy the generated script locally for inspection
    console.log("\n📦 Copying generated script...");

    try {
      const lsResult = await sandboxProvider.runCommand({
        cmd: "ls",
        args: ["-la", userCodeDir],
      });

      if (lsResult.exitCode === 0) {
        const files = (await lsResult.stdout())
          .split("\n")
          .filter((line) => line.includes(".ts"))
          .map((line) => line.split(/\s+/).pop())
          .filter(Boolean);

        if (files.length > 0) {
          console.log(`\nFound ${files.length} generated file(s):`);

          for (const file of files) {
            const catResult = await sandboxProvider.runCommand({
              cmd: "cat",
              args: [`${userCodeDir}/${file}`],
            });

            if (catResult.exitCode === 0) {
              const content = await catResult.stdout();
              console.log(`\n${"=".repeat(60)}`);
              console.log(`📄 ${file}`);
              console.log("=".repeat(60));
              console.log(content);
              console.log("=".repeat(60));
            }
          }
        }
      }
    } catch (err) {
      console.log("Note: Could not copy scripts (this is okay)");
    }

    // Cleanup
    console.log("\n🧹 Cleaning up...");
    await explorer.cleanup();
    console.log("✅ Done!\n");
  } catch (error) {
    console.error("❌ Error:", error);
    await sandboxProvider.stop();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
