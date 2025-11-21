/**
 * Simple Vercel MCP Example
 *
 * This example demonstrates:
 * - VercelSandboxProvider: Cloud sandbox execution
 * - MCP (Model Context Protocol) with Vercel MCP server
 *
 * Required Environment Variables:
 * - OPENAI_API_KEY (required)
 *
 * Usage:
 *   npm run example:mcp-vercel-simple
 *
 * This example shows sandbox invocation and tool registration.
 */

import { stepCountIs, streamText, tool } from "ai";
import dotenv from "dotenv";
import { z } from "zod";
import { SANDBOX_SYSTEM_PROMPT } from "../../src/sandbox-code-generator/prompts.js";
import { createVercelSandboxCodeMode } from "../../src/sandbox-code-generator/sandbox-utils.js";

// Load environment variables
dotenv.config();

// Simple weather tool
const weatherTool = tool({
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The city or location to get weather for"),
    units: z
      .enum(["celsius", "fahrenheit"])
      .optional()
      .default("fahrenheit")
      .describe("Temperature units"),
  }),
  async execute({ location, units }) {
    // Simulate weather API call with mock data
    const baseTemp = units === "celsius" ? 22 : 72;
    const variation = Math.floor(Math.random() * 21) - 10;
    const temperature = baseTemp + variation;

    const conditions = ["sunny", "cloudy", "partly cloudy", "rainy", "clear"];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];

    return {
      location,
      temperature,
      units: units === "celsius" ? "°C" : "°F",
      condition,
      humidity: Math.floor(Math.random() * 40) + 40,
      windSpeed: Math.floor(Math.random() * 15) + 5,
      timestamp: new Date().toISOString(),
    };
  },
});

async function main() {
  console.log("\n🚀 Simple Vercel MCP Example\n");

  // Create Vercel sandbox in code mode (transforms MCP servers and tools into executable code)
  // sandboxOptions are optional - defaults are applied automatically (30min timeout, node22, 4 vcpus)
  const { tools, manager } = await createVercelSandboxCodeMode({
    servers: [
      {
        name: "vercel",
        url: "https://mcp.vercel.com",
        useSSE: false,
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_API_KEY}`,
        },
      },
    ],
    standardTools: {
      weather: weatherTool,
    },
  });

  const query = "What tools are available from the Vercel MCP server?";

  console.log(`You: ${query}\n`);

  try {
    const result = streamText({
      model: "openai/gpt-4.1-mini",
      tools,
      stopWhen: stepCountIs(20),
      system: SANDBOX_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
    });

    // Stream the assistant response
    process.stdout.write("Assistant: ");
    for await (const textPart of result.textStream) {
      process.stdout.write(textPart);
    }
    console.log("\n");

    // Wait for final response
    await result.response;

    console.log("\n✅ Query complete!\n");
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}\n`);
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}\n`);
    }
  }

  // Cleanup
  console.log("🧹 Cleaning up...");
  await manager.cleanup();
  console.log("✅ Done!\n");
}

main().catch(async (error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
