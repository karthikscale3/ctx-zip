import { generateText, stepCountIs, tool } from "ai";
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
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

async function main() {
  console.log(`\n🗂️  Session ID: ${sessionId}`);
  console.log(`📁 Storage location: ${fileAdapter.toString()}\n`);

  // 1) Ask the model to summarize recent emails (will call fetchEmails)
  const first = await generateText({
    model: "openai/gpt-4.1-mini",
    tools,
    stopWhen: stepCountIs(4),
    system: "You are a helpful assistant that can help with emails.",
    messages: [
      {
        role: "user",
        content: "Summarize my recent emails.",
      },
    ],
  });

  console.log("\n=== First Answer (Summary) ===");
  console.log(first.text);

  const firstConversation = first.response.messages;
  console.log("\n=== First Conversation (Before Compaction) ===");
  console.log(`Messages: ${firstConversation.length}`);

  const compacted = await compactMessages(firstConversation, {
    baseDir: fileAdapter,
    boundary: "all",
    sessionId,
  });
  console.log("\n=== Compacted Conversation ===");
  console.log(`Messages: ${compacted.length}`);
  console.log(JSON.stringify(compacted, null, 2));

  // 2) Show the persisted JSON file structure
  console.log("\n=== Persisted Files ===");
  console.log("Tool results have been saved to JSON files with metadata.");
  console.log(
    `Check: ${path.resolve(
      process.cwd(),
      ".ctx-storage",
      sessionId,
      "tool-results"
    )}`
  );

  // 3) Ask a realistic follow-up that should read from the persisted file
  const followUp = await generateText({
    model: "openai/gpt-4.1-mini",
    tools,
    stopWhen: stepCountIs(4),
    system: "You are a helpful assistant that can help with emails.",
    messages: [
      ...compacted,
      {
        role: "user",
        content: "Great! Are there any important emails?",
      },
    ],
  });

  console.log("\n=== Follow-up Answer ===");
  console.log(followUp.text);

  const secondConversation = followUp.response.messages;
  console.log("\n=== Follow-up Conversation (Before Compaction) ===");
  console.log(`Messages: ${secondConversation.length}`);

  const compactedFollowUp = await compactMessages(secondConversation, {
    baseDir: fileAdapter,
    boundary: "all",
    sessionId,
  });
  console.log("\n=== Compacted Follow-up Conversation ===");
  console.log(`Messages: ${compactedFollowUp.length}`);
  console.log(JSON.stringify(compactedFollowUp, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
