/**
 * Interactive GitHub Search Assistant with Vercel and grep.app
 *
 * This example demonstrates an interactive chat interface that uses:
 * - Vercel: Cloud sandbox provider (no additional setup required)
 * - MCP (Model Context Protocol) with grep.app for GitHub search
 *
 * Required Environment Variables:
 * - OPENAI_API_KEY (required)
 *
 * Usage:
 *   npm run example:mcp-vercel
 *
 * Features:
 * - Interactive chat loop for exploring GitHub repositories
 * - Real-time tool execution tracking
 * - Token usage and cost tracking
 * - Persistent conversation history
 */

import { getTokenCosts } from "@tokenlens/helpers";
import { ModelMessage, stepCountIs, streamText } from "ai";
import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as readline from "node:readline";
import { fetchModels } from "tokenlens";
import { SANDBOX_SYSTEM_PROMPT } from "../../src/sandbox-code-generator/prompts.js";
import { SandboxManager } from "../../src/sandbox-code-generator/sandbox-manager.js";
import { VercelSandboxProvider } from "../../src/sandbox-code-generator/vercel-sandbox-provider.js";

// Load environment variables
dotenv.config();

// Stats interface to track conversation metrics
interface ConversationStats {
  totalMessages: number;
  apiTokensInput: number;
  apiTokensOutput: number;
  apiTokensTotal: number;
  costUSD: number;
  toolCallsThisTurn: number;
  totalToolCalls: number;
}

/**
 * Validate required environment variables
 */
function validateEnvironment(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!process.env.OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY");
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Load messages from file
 */
function loadMessages(messagesFilePath: string): ModelMessage[] {
  if (existsSync(messagesFilePath)) {
    const raw = readFileSync(messagesFilePath, "utf-8");
    return JSON.parse(raw);
  }
  return [];
}

/**
 * Save messages to file
 */
function saveMessages(messagesFilePath: string, messages: ModelMessage[]) {
  const dir = path.dirname(messagesFilePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
}

async function main() {
  console.log("\n🚀 Interactive GitHub Search Assistant (Vercel)\n");

  // Validate environment variables
  const validation = validateEnvironment();

  if (!validation.valid) {
    console.error("❌ Missing required environment variables:");
    validation.missing.forEach((varName) => {
      console.error(`   - ${varName}`);
    });
    console.error(
      "\nPlease set these variables in your .env file or environment.\n"
    );
    process.exit(1);
  }

  console.log("✅ Environment validated\n");

  // Initialize with Vercel sandbox
  console.log("🔧 Creating Vercel sandbox...");
  const sandboxProvider = await VercelSandboxProvider.create({
    timeout: 1800000, // 30 minutes
    runtime: "node22",
    vcpus: 4,
  });

  // Initialize SandboxManager with Vercel provider
  console.log("🔧 Setting up sandbox manager...");
  const manager = await SandboxManager.create({
    sandboxProvider,
  });

  // Register MCP tools
  console.log("🔧 Registering MCP tools (grep.app)...");
  await manager.register({
    servers: [
      {
        name: "grep-app",
        url: "https://mcp.grep.app",
      },
    ],
  });

  // Get all tools
  const tools = manager.getAllTools();

  const mcpDir = manager.getMcpDir();
  const userCodeDir = manager.getUserCodeDir();

  // Create session ID and messages file path
  const sessionId = `github-search-${new Date()
    .toISOString()
    .slice(0, 10)}-${Date.now().toString(36)}`;
  const storageDir = path.resolve(process.cwd(), ".sandbox-vercel");
  const messagesFilePath = path.resolve(
    storageDir,
    sessionId,
    "conversation.json"
  );

  // Load existing conversation
  let messages = loadMessages(messagesFilePath);

  // Fetch OpenAI provider data for token/cost calculations
  const openaiProvider = await fetchModels("openai");

  // Initialize stats
  let stats: ConversationStats = {
    totalMessages: messages.length,
    apiTokensInput: 0,
    apiTokensOutput: 0,
    apiTokensTotal: 0,
    costUSD: 0,
    toolCallsThisTurn: 0,
    totalToolCalls: 0,
  };

  console.log("\n" + "=".repeat(80));
  console.log("🤖 Interactive GitHub Search Assistant");
  console.log(`Session: ${sessionId}`);
  console.log(`Sandbox: Vercel | MCP Tools: grep.app`);
  console.log("=".repeat(80) + "\n");

  if (messages.length > 0) {
    console.log(
      `📝 Loaded ${messages.length} messages from previous session\n`
    );
  }

  console.log("💡 Tips:");
  console.log(
    "  - Ask me to search GitHub repositories for code, patterns, or implementations"
  );
  console.log("  - I can read and analyze tool definitions in the sandbox");
  console.log("  - Type 'exit' or 'quit' to end the session\n");

  // Function to display stats
  function displayStats() {
    console.log("\n" + "-".repeat(80));
    console.log("📊 Stats:");
    console.log(`  Messages: ${stats.totalMessages}`);
    console.log(`  Tool Calls (this turn): ${stats.toolCallsThisTurn}`);
    console.log(`  Total Tool Calls: ${stats.totalToolCalls}`);
    console.log(`  Last API Call:`);
    console.log(`    Input: ${stats.apiTokensInput} tokens`);
    console.log(`    Output: ${stats.apiTokensOutput} tokens`);
    console.log(`    Total: ${stats.apiTokensTotal} tokens`);
    console.log(`    Cost: $${stats.costUSD.toFixed(6)}`);
    console.log("-".repeat(80) + "\n");
  }

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You: ",
  });

  // Display initial stats
  displayStats();

  // Cleanup function
  const cleanup = async () => {
    rl.close();
    console.log("\n🧹 Cleaning up Vercel sandbox...");
    await manager.cleanup();
    console.log("✅ Done!\n");
  };

  // Main chat loop
  rl.prompt();

  rl.on("line", async (line: string) => {
    const userInput = line.trim();

    if (!userInput) {
      rl.prompt();
      return;
    }

    // Check for exit command
    if (
      userInput.toLowerCase() === "exit" ||
      userInput.toLowerCase() === "quit"
    ) {
      await cleanup();
      console.log("👋 Goodbye!");
      process.exit(0);
    }

    // Display user message
    console.log(`\nYou: ${userInput}`);

    // Add user message to conversation
    messages.push({
      role: "user",
      content: userInput,
    });

    try {
      // Reset tool call counter
      stats.toolCallsThisTurn = 0;

      // Stream the response with tool call tracking
      const result = streamText({
        model: "openai/gpt-4.1-mini",
        tools,
        stopWhen: stepCountIs(20),
        system: SANDBOX_SYSTEM_PROMPT,
        messages,
        onStepFinish: (step) => {
          const { toolCalls } = step;
          if (toolCalls && toolCalls.length > 0) {
            stats.toolCallsThisTurn += toolCalls.length;
            stats.totalToolCalls += toolCalls.length;

            console.log(`\n🔧 Tool Calls:`);
            toolCalls.forEach((call) => {
              const toolName = call.toolName;
              const args = (call as any).args || {};
              console.log(`   - ${toolName}`);
              const argsStr = JSON.stringify(args, null, 2);
              if (argsStr.length > 200) {
                console.log(`     ${argsStr.substring(0, 200)}...`);
              } else {
                console.log(`     ${argsStr}`);
              }
            });
            console.log("");
          }
        },
      });

      // Stream the assistant response in real-time
      process.stdout.write("Assistant: ");
      let streamedText = "";

      for await (const textPart of result.textStream) {
        streamedText += textPart;
        process.stdout.write(textPart);
      }

      // Add final newline
      console.log("\n");

      // Get the response and actual token usage
      const response = await result.response;
      const responseMessages = response.messages;
      const actualUsage = await result.usage;

      if (actualUsage && openaiProvider) {
        const modelId = "openai/gpt-4.1-mini";
        const costs = getTokenCosts(modelId, actualUsage, openaiProvider);

        const inputTokens = actualUsage.inputTokens || 0;
        const outputTokens = actualUsage.outputTokens || 0;
        const totalTokens =
          actualUsage.totalTokens || inputTokens + outputTokens;

        stats.apiTokensInput = inputTokens;
        stats.apiTokensOutput = outputTokens;
        stats.apiTokensTotal = totalTokens;
        stats.costUSD = costs.totalUSD || 0;
      }

      // Append NEW response messages to the conversation
      for (const msg of responseMessages) {
        messages.push(msg);
      }

      // Update message count
      stats.totalMessages = messages.length;

      // Save to file
      saveMessages(messagesFilePath, messages);

      // Display updated stats
      displayStats();
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
    }

    // Prompt for next input
    rl.prompt();
  });

  // Handle Ctrl+C to exit
  rl.on("SIGINT", async () => {
    await cleanup();
    console.log("\n👋 Goodbye!");
    process.exit(0);
  });
}

main().catch(async (error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
