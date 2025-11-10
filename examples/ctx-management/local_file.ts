import { getTokenCosts } from "@tokenlens/helpers";
import { ModelMessage, stepCountIs, streamText, tool } from "ai";
import blessed from "blessed";
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchModels } from "tokenlens";
import { z } from "zod";
import {
  compactMessages,
  createGrepAndSearchFileTool,
  createReadFileTool,
  FileAdapterClass as FileAdapter,
} from "../../src";

// Create a session ID for this conversation
const sessionId = `demo-${new Date()
  .toISOString()
  .slice(0, 10)}-${Date.now().toString(36)}`;

// Create file adapter with session support
const fileAdapter = new FileAdapter({
  baseDir: path.resolve(process.cwd(), ".ctx-storage"),
  sessionId,
});

// File to store conversation messages
const messagesFilePath = path.resolve(
  process.cwd(),
  ".ctx-storage",
  sessionId,
  "conversation.json"
);

// Tools
const tools = {
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
  readFile: createReadFileTool({ baseDir: fileAdapter }),
  grepAndSearchFile: createGrepAndSearchFileTool({ baseDir: fileAdapter }),
};

// Estimate token count for messages array
// This is a rough estimation based on character count
// For actual usage, we'll use the AI SDK's usage data
function estimateTokensInMessages(messages: ModelMessage[]): number {
  const text = JSON.stringify(messages);
  // Rough heuristic: ~4 characters per token
  return Math.ceil(text.length / 4);
}

// Load messages from file
function loadMessages(): ModelMessage[] {
  if (existsSync(messagesFilePath)) {
    const raw = readFileSync(messagesFilePath, "utf-8");
    return JSON.parse(raw);
  }
  return [];
}

// Save messages to file
function saveMessages(messages: ModelMessage[]) {
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
  // Fetch OpenAI provider data for token/cost calculations
  const openaiProvider = await fetchModels("openai");

  // Load existing conversation
  let messages = loadMessages();

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

  // Create a screen object
  const screen = blessed.screen({
    smartCSR: true,
    title: "Interactive Email Assistant",
    mouse: true,
    sendFocus: true,
  });

  // Chat box (left side, 70% width)
  const chatBox = blessed.box({
    top: 0,
    left: 0,
    width: "70%",
    height: "90%",
    content: "{center}{bold}💬 Chat{/bold}{/center}\n",
    tags: true,
    border: {
      type: "line",
    },
    style: {
      fg: "white",
      border: {
        fg: "cyan",
      },
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: " ",
      style: {
        inverse: true,
      },
    },
    keys: false, // Disable keys - we'll handle scrolling separately
    mouse: true,
    focusable: true,
  });

  // Stats box (right side, 30% width)
  const statsBox = blessed.box({
    top: 0,
    left: "70%",
    width: "30%",
    height: "90%",
    content: "{center}{bold}📊 Stats{/bold}{/center}\n",
    tags: true,
    border: {
      type: "line",
    },
    style: {
      fg: "white",
      border: {
        fg: "green",
      },
    },
    scrollable: true,
    keys: false, // Disable keys - we'll handle scrolling separately
    mouse: true,
    focusable: true,
    scrollbar: {
      ch: " ",
      style: {
        inverse: true,
      },
    },
  });

  // Input box (bottom, full width)
  const inputBox = blessed.textbox({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    inputOnFocus: true,
    border: {
      type: "line",
    },
    style: {
      fg: "white",
      border: {
        fg: "yellow",
      },
      focus: {
        border: {
          fg: "yellow",
        },
      },
    },
  });

  // Info box at the top
  const infoBox = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    content: `{center}Session: ${sessionId} | Storage: ${fileAdapter.toString()}{/center}`,
    tags: true,
    border: {
      type: "line",
    },
    style: {
      fg: "white",
      border: {
        fg: "magenta",
      },
    },
  });

  // Adjust other boxes to accommodate info box
  chatBox.top = 3;
  chatBox.height = "87%";
  statsBox.top = 3;
  statsBox.height = "87%";

  // Append boxes to screen
  screen.append(infoBox);
  screen.append(chatBox);
  screen.append(statsBox);
  screen.append(inputBox);

  // Function to update stats display
  function updateStatsDisplay() {
    const content =
      `{center}{bold}📊 Stats{/bold}{/center}\n\n` +
      `{cyan-fg}Messages:{/cyan-fg} ${stats.totalMessages}\n\n` +
      `{green-fg}Last API Call:{/green-fg}\n` +
      `  Input: ${stats.apiTokensInput}\n` +
      `  Output: ${stats.apiTokensOutput}\n` +
      `  Total: ${stats.apiTokensTotal}\n` +
      `  Cost: $${stats.costUSD.toFixed(6)}\n\n` +
      `{yellow-fg}Compaction:{/yellow-fg}\n` +
      `  Before: ${stats.estimatedTokensBefore}\n` +
      `  After: ${stats.estimatedTokensAfter}\n` +
      `  Saved: ${stats.tokensSaved}\n` +
      `  Reduction: ${stats.percentSaved}%`;

    statsBox.setContent(content);
    screen.render();
  }

  // Function to add message to chat
  function addToChatBox(role: "user" | "assistant" | "system", text: string) {
    const prefix =
      role === "user"
        ? "{cyan-fg}You:{/cyan-fg}"
        : role === "assistant"
        ? "{green-fg}Assistant:{/green-fg}"
        : "{magenta-fg}System:{/magenta-fg}";
    const currentContent = chatBox.getContent();
    chatBox.setContent(currentContent + `\n${prefix} ${text}\n`);
    chatBox.setScrollPerc(100);
    screen.render();
  }

  // Initialize display
  if (messages.length > 0) {
    addToChatBox(
      "system",
      `Loaded ${messages.length} messages from previous session`
    );
  }
  addToChatBox(
    "system",
    "Type and press Enter to chat | Tab: cycle focus | Mouse wheel/Arrow keys: scroll | Ctrl+C: exit"
  );
  updateStatsDisplay();

  // Focus input box
  inputBox.focus();

  // Handle input submission
  inputBox.on("submit", async (value: string) => {
    const userInput = value.trim();
    inputBox.clearValue();

    if (!userInput) {
      inputBox.focus();
      return;
    }

    // Check for exit command
    if (
      userInput.toLowerCase() === "exit" ||
      userInput.toLowerCase() === "quit"
    ) {
      screen.destroy();
      console.log("\n👋 Goodbye!");
      process.exit(0);
    }

    // Add user message to chat
    addToChatBox("user", userInput);

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
      let streamedText = "";
      let contentBeforeAssistant = "";

      for await (const textPart of result.textStream) {
        streamedText += textPart;

        if (!contentBeforeAssistant) {
          // First chunk - capture the content before the assistant response
          contentBeforeAssistant = chatBox.getContent();
        }

        // Rebuild the content: everything before + current assistant text
        chatBox.setContent(
          contentBeforeAssistant +
            `\n{green-fg}Assistant:{/green-fg} ${streamedText}`
        );

        chatBox.setScrollPerc(100);
        screen.render();
      }

      // Add final newline
      if (streamedText) {
        const finalContent = chatBox.getContent();
        chatBox.setContent(finalContent + "\n");
      }

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
      const compacted = await compactMessages(messages, {
        baseDir: fileAdapter,
        boundary: "all",
        sessionId,
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
      saveMessages(messages);

      // Update stats display
      updateStatsDisplay();
    } catch (error: any) {
      addToChatBox("system", `Error: ${error.message}`);
    }

    // Reset focus to input box
    focusIndex = 0;
    inputBox.focus();
    updateFocusBorders();
    screen.render();
  });

  // Handle Ctrl+C to exit
  screen.key(["C-c"], () => {
    screen.destroy();
    console.log("\n👋 Goodbye!");
    process.exit(0);
  });

  // Tab to cycle focus between boxes
  let focusIndex = 0; // 0: input, 1: chat, 2: stats
  const focusableElements = [inputBox, chatBox, statsBox];
  const defaultBorderColors = ["yellow", "cyan", "green"];

  function updateFocusBorders() {
    focusableElements.forEach((el, idx) => {
      el.style.border = {
        fg: idx === focusIndex ? "white" : defaultBorderColors[idx],
      };
    });
  }

  screen.key(["tab"], () => {
    focusIndex = (focusIndex + 1) % focusableElements.length;
    focusableElements[focusIndex].focus();
    updateFocusBorders();
    screen.render();
  });

  // Shift+Tab to cycle focus backwards
  screen.key(["S-tab"], () => {
    focusIndex =
      (focusIndex - 1 + focusableElements.length) % focusableElements.length;
    focusableElements[focusIndex].focus();
    updateFocusBorders();
    screen.render();
  });

  // Scroll keys for chat and stats boxes - only when NOT in input
  screen.key(["up"], () => {
    if (focusIndex === 1) {
      chatBox.scroll(-1);
      screen.render();
    } else if (focusIndex === 2) {
      statsBox.scroll(-1);
      screen.render();
    }
  });

  screen.key(["down"], () => {
    if (focusIndex === 1) {
      chatBox.scroll(1);
      screen.render();
    } else if (focusIndex === 2) {
      statsBox.scroll(1);
      screen.render();
    }
  });

  screen.key(["pageup"], () => {
    if (focusIndex === 1) {
      chatBox.scroll(-10);
      screen.render();
    } else if (focusIndex === 2) {
      statsBox.scroll(-10);
      screen.render();
    }
  });

  screen.key(["pagedown"], () => {
    if (focusIndex === 1) {
      chatBox.scroll(10);
      screen.render();
    } else if (focusIndex === 2) {
      statsBox.scroll(10);
      screen.render();
    }
  });

  // Update borders for initial focus
  updateFocusBorders();

  // Render the screen
  screen.render();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
