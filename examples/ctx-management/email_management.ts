/**
 * Interactive Email Assistant with Multi-Environment Support
 *
 * This example demonstrates context compression with support for multiple environments:
 * - Local: File system storage (no additional setup)
 * - E2B: Cloud sandbox provider (requires E2B_API_KEY)
 * - Vercel: Cloud sandbox provider (no additional setup currently)
 *
 * Required Environment Variables:
 * - OPENAI_API_KEY (required for all environments)
 * - E2B_API_KEY (required only for E2B environment)
 *
 * Usage:
 *   npm run example:ctx-local
 *
 * You'll be prompted to select an environment, and the example will validate
 * that all required environment variables are set before starting.
 */

import { getTokenCosts } from "@tokenlens/helpers";
import { ModelMessage, stepCountIs, streamText, tool } from "ai";
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as readline from "node:readline";
import prompts from "prompts";
import { fetchModels } from "tokenlens";
import { z } from "zod";
import {
  compact,
  createGrepAndSearchFileTool,
  createReadFileTool,
  E2BSandboxProvider,
  FileAdapter,
  SandboxManager,
  VercelSandboxProvider,
} from "../../src";

// Environment types
type Environment = "local" | "e2b" | "vercel";

// Environment configuration
interface EnvironmentConfig {
  type: Environment;
  storageBaseDir: string;
  sessionId: string;
  fileAdapter: FileAdapter;
  cleanup?: () => Promise<void>; // Optional cleanup function for sandbox providers
}

/**
 * Validate environment variables for the selected environment
 */
function validateEnvironment(env: Environment): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  // OpenAI API key is required for all environments
  if (!process.env.OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY");
  }

  // E2B specific validation
  if (env === "e2b") {
    if (!process.env.E2B_API_KEY) {
      missing.push("E2B_API_KEY");
    }
  }

  // Vercel specific validation (if needed)
  if (env === "vercel") {
    // Vercel sandbox might use VERCEL_API_TOKEN or work without explicit auth
    // Add validation here if needed in the future
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Prompt user to select environment and validate
 */
async function selectEnvironment(): Promise<EnvironmentConfig> {
  console.log("\n🚀 Interactive Email Assistant - Environment Setup\n");

  const response = await prompts({
    type: "select",
    name: "environment",
    message: "Select your environment:",
    choices: [
      { title: "Local (file system storage)", value: "local" },
      { title: "E2B (cloud sandbox)", value: "e2b" },
      { title: "Vercel (cloud sandbox)", value: "vercel" },
    ],
    initial: 0,
  });

  // Handle Ctrl+C
  if (!response.environment) {
    console.log("\n👋 Goodbye!");
    process.exit(0);
  }

  const environment = response.environment as Environment;

  // Validate environment variables
  const validation = validateEnvironment(environment);

  if (!validation.valid) {
    console.error("\n❌ Missing required environment variables:");
    validation.missing.forEach((varName) => {
      console.error(`   - ${varName}`);
    });
    console.error(
      "\nPlease set these variables in your .env file or environment.\n"
    );
    process.exit(1);
  }

  console.log(`\n✅ Environment validated: ${environment}\n`);

  // Create session ID
  const sessionId = `demo-${new Date()
    .toISOString()
    .slice(0, 10)}-${Date.now().toString(36)}`;

  // Create file adapter based on environment
  let fileAdapter: FileAdapter;
  let storageBaseDir: string;
  let cleanup: (() => Promise<void>) | undefined;

  if (environment === "local") {
    // Local file system storage
    storageBaseDir = path.resolve(process.cwd(), ".sandbox-local");
    fileAdapter = SandboxManager.createLocalFileAdapter({
      baseDir: storageBaseDir,
      sessionId,
    });
  } else if (environment === "e2b") {
    // E2B sandbox storage
    console.log("Creating E2B sandbox...");
    const sandboxProvider = await E2BSandboxProvider.create({
      timeout: 1800000, // 30 minutes
    });

    const sandboxManager = await SandboxManager.create({
      sandboxProvider,
    });

    storageBaseDir = path.resolve(process.cwd(), `.sandbox-${environment}`);
    fileAdapter = sandboxManager.getFileAdapter({
      sessionId,
    });

    cleanup = async () => {
      console.log("\n🧹 Cleaning up E2B sandbox...");
      await sandboxManager.cleanup();
    };
  } else if (environment === "vercel") {
    // Vercel sandbox storage
    console.log("Creating Vercel sandbox...");
    const sandboxProvider = await VercelSandboxProvider.create({
      timeout: 1800000, // 30 minutes
      runtime: "node22",
      vcpus: 4,
    });

    const sandboxManager = await SandboxManager.create({
      sandboxProvider,
    });

    storageBaseDir = path.resolve(process.cwd(), `.sandbox-${environment}`);
    fileAdapter = sandboxManager.getFileAdapter({
      sessionId,
    });

    cleanup = async () => {
      console.log("\n🧹 Cleaning up Vercel sandbox...");
      await sandboxManager.cleanup();
    };
  } else {
    throw new Error(`Unknown environment: ${environment}`);
  }

  return {
    type: environment,
    storageBaseDir,
    sessionId,
    fileAdapter,
    cleanup,
  };
}

/**
 * Create tools with the given file adapter
 */
function createTools(fileAdapter: FileAdapter) {
  return {
    fetchEmails: tool({
      description: "Fetch recent emails for the current user (50 items)",
      inputSchema: z
        .object({
          limit: z.number().int().min(1).max(200).default(50).optional(),
        })
        .optional(),
      async execute(input) {
        const limit = input?.limit ?? 50;
        const fileUrl = new URL("./mock_emails.json", import.meta.url);
        const raw = readFileSync(fileUrl, "utf-8");
        const data = JSON.parse(raw);
        const emails = Array.isArray(data.emails)
          ? data.emails.slice(0, limit)
          : [];
        return {
          meta: {
            ...(data.meta ?? {}),
            fetchedAt: new Date().toISOString(),
            total: emails.length,
          },
          emails,
        };
      },
    }),
    readFile: createReadFileTool({ storage: fileAdapter }),
    grepAndSearchFile: createGrepAndSearchFileTool({ storage: fileAdapter }),
  };
}

/**
 * Estimate token count for messages array
 * This is a rough estimation based on character count
 * For actual usage, we'll use the AI SDK's usage data
 */
function estimateTokensInMessages(messages: ModelMessage[]): number {
  const text = JSON.stringify(messages);
  // Rough heuristic: ~4 characters per token
  return Math.ceil(text.length / 4);
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

// Stats interface to track conversation metrics
interface ConversationStats {
  totalMessages: number;
  apiTokensInput: number;
  apiTokensOutput: number;
  apiTokensTotal: number;
  costUSD: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  tokensSaved: number;
  percentSaved: string;
}

async function main() {
  // Select and validate environment
  const envConfig = await selectEnvironment();

  // Use file adapter from environment config
  const fileAdapter = envConfig.fileAdapter;

  // Create messages file path (stored locally even for sandbox environments)
  const messagesFilePath = path.resolve(
    envConfig.storageBaseDir,
    envConfig.sessionId,
    "conversation.json"
  );

  // Create tools
  const tools = createTools(fileAdapter);

  // Fetch OpenAI provider data for token/cost calculations
  const openaiProvider = await fetchModels("openai");

  // Load existing conversation
  let messages = loadMessages(messagesFilePath);

  // Initialize stats
  let stats: ConversationStats = {
    totalMessages: messages.length,
    apiTokensInput: 0,
    apiTokensOutput: 0,
    apiTokensTotal: 0,
    costUSD: 0,
    estimatedTokensBefore: 0,
    estimatedTokensAfter: 0,
    tokensSaved: 0,
    percentSaved: "0.0",
  };

  // Simple console-based UI
  console.log("\n" + "=".repeat(80));
  console.log(`🚀 Interactive Email Assistant`);
  console.log(
    `Environment: ${envConfig.type.toUpperCase()} | Session: ${
      envConfig.sessionId
    }`
  );
  console.log(`Storage: ${fileAdapter.toString()}`);
  console.log("=".repeat(80) + "\n");

  if (messages.length > 0) {
    console.log(
      `📝 Loaded ${messages.length} messages from previous session\n`
    );
  }

  // Function to display stats
  function displayStats() {
    console.log("\n" + "-".repeat(80));
    console.log("📊 Stats:");
    console.log(`  Messages: ${stats.totalMessages}`);
    console.log(`  Last API Call:`);
    console.log(`    Input: ${stats.apiTokensInput} tokens`);
    console.log(`    Output: ${stats.apiTokensOutput} tokens`);
    console.log(`    Total: ${stats.apiTokensTotal} tokens`);
    console.log(`    Cost: $${stats.costUSD.toFixed(6)}`);
    console.log(`  Compaction:`);
    console.log(`    Before: ${stats.estimatedTokensBefore} tokens`);
    console.log(`    After: ${stats.estimatedTokensAfter} tokens`);
    console.log(
      `    Saved: ${stats.tokensSaved} tokens (${stats.percentSaved}% reduction)`
    );
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
      rl.close();
      if (envConfig.cleanup) {
        await envConfig.cleanup();
      }
      console.log("\n👋 Goodbye!");
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
      // Stream the response with tool call tracking
      const result = streamText({
        model: "openai/gpt-4.1-mini",
        tools,
        stopWhen: stepCountIs(4),
        system: "You are a helpful assistant that can help with emails.",
        messages,
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

      // Show stats before compaction
      const tokensBefore = estimateTokensInMessages(messages);
      stats.estimatedTokensBefore = tokensBefore;

      // Compact the ENTIRE conversation
      const compacted = await compact(messages, {
        storage: fileAdapter,
        boundary: "all",
        sessionId: envConfig.sessionId,
      });

      const tokensAfter = estimateTokensInMessages(compacted);
      const tokensSaved = tokensBefore - tokensAfter;
      const percentSaved =
        tokensBefore > 0
          ? ((tokensSaved / tokensBefore) * 100).toFixed(1)
          : "0.0";

      stats.estimatedTokensAfter = tokensAfter;
      stats.tokensSaved = tokensSaved;
      stats.percentSaved = percentSaved;

      // Update messages with compacted version
      messages = compacted;

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
    rl.close();
    if (envConfig.cleanup) {
      await envConfig.cleanup();
    }
    console.log("\n\n👋 Goodbye!");
    process.exit(0);
  });
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
