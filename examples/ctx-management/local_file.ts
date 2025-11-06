import { generateText, stepCountIs, tool } from "ai";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  compactMessages,
  createGrepAndSearchFileTool,
  createReadFileTool,
  resolveFileUriFromBaseDir,
} from "../src";

// Tools
const storage = resolveFileUriFromBaseDir(process.cwd());
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
  readFile: createReadFileTool({ storage }),
  grepAndSearchFile: createGrepAndSearchFileTool({ storage }),
};

async function main() {
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
  console.log("\n=== First Conversation ===");
  console.log(JSON.stringify(firstConversation, null, 2));

  const compacted = await compactMessages(firstConversation, {
    storage,
    boundary: "entire-conversation",
  });
  console.log("\n=== Compacted Conversation ===");
  console.log(JSON.stringify(compacted, null, 2));

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
  console.log("\n=== Follow-up Conversation ===");
  console.log(JSON.stringify(secondConversation, null, 2));

  const compactedFollowUp = await compactMessages(secondConversation, {
    storage,
    boundary: "entire-conversation",
  });
  console.log("\n=== Compacted Follow-up Conversation ===");
  console.log(JSON.stringify(compactedFollowUp, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
