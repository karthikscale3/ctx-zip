/**
 * Weather Tool Sandbox Demo
 *
 * This example shows how to turn an AI SDK tool into source code inside a sandbox
 * using the unified `SandboxExplorer`. It supports all three sandbox providers shipped
 * with ctx-zip (local filesystem, Vercel Sandbox, and E2B).
 *
 * Usage:
 *   npm run example:tools-weather -- --provider=local
 *   npm run example:tools-weather -- --provider=vercel
 *   npm run example:tools-weather -- --provider=e2b
 *   npm run example:tools-weather -- --provider=all   # run sequentially
 *
 * Requirements:
 *   - Local sandbox: no additional setup.
 *   - Vercel sandbox: requires `@vercel/sandbox` optional dependency and Vercel login.
 *   - E2B sandbox: install `@e2b/code-interpreter` and set E2B_API_KEY.
 */

import { tool } from "ai";
import { z } from "zod";

import { SandboxManager } from "../../src/sandbox-code-generator/sandbox-manager.js";
import type { SandboxProvider } from "../../src/sandbox-code-generator/sandbox-provider.js";
import type { ToolCodeGenerationResult } from "../../src/sandbox-code-generator/tool-code-writer.js";

type ProviderName = "local" | "vercel" | "e2b";
type ProviderSelection = ProviderName | "all";

const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const providerArg = (getArgValue("provider") ?? "local") as ProviderSelection;
const locationArg = getArgValue("location") ?? "San Francisco";
const sampleLocation = locationArg;

const providerSequence: ProviderName[] =
  providerArg === "all"
    ? ["local", "vercel", "e2b"]
    : [validateProvider(providerArg)];

// Weather tool taken from the AI SDK tool calling documentation.
const weatherTool = tool({
  description: "Get the weather in a location",
  inputSchema: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  async execute({ location }: { location: string }) {
    const temperature = 72 + Math.floor(Math.random() * 21) - 10;
    return {
      location,
      temperature,
      units: "°F",
      generatedAt: new Date().toISOString(),
    };
  },
});

async function main() {
  console.log(
    `\n🌤️  Weather tool demo (location: ${sampleLocation}, provider(s): ${providerSequence.join(
      ", "
    )})\n`
  );

  for (const providerName of providerSequence) {
    console.log(`\n=== ${providerName.toUpperCase()} SANDBOX ===`);

    let sandboxProvider: SandboxProvider | undefined;
    let manager: SandboxManager | undefined;

    try {
      sandboxProvider = await createProvider(providerName);
      manager = await SandboxManager.create({
        sandboxProvider,
      });

      await manager.register({
        standardTools: {
          weather: weatherTool,
        },
        standardToolOptions: {
          title: "Weather Agent Tool",
        },
      });

      await runWeatherDemo(manager, providerName, sampleLocation);
    } catch (error) {
      console.error(
        `✗ Error while running demo in ${providerName} sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      if (providerName === "e2b") {
        console.error(
          "  • Make sure @e2b/code-interpreter is installed and E2B_API_KEY is set."
        );
      }
      if (providerName === "vercel") {
        console.error(
          "  • Ensure @vercel/sandbox is installed and you have access to Vercel Sandbox."
        );
      }
    } finally {
      try {
        if (manager) {
          await manager.cleanup();
        } else if (sandboxProvider) {
          await sandboxProvider.stop();
        }
      } catch (stopError) {
        console.error(
          `⚠️  Error while stopping ${providerName} sandbox: ${
            stopError instanceof Error ? stopError.message : String(stopError)
          }`
        );
      }
    }
  }

  console.log("\n✅ Weather tool demo complete.\n");
}

function validateProvider(provider: ProviderSelection): ProviderName {
  if (provider === "all") {
    return "local";
  }
  if (provider === "local" || provider === "vercel" || provider === "e2b") {
    return provider;
  }
  throw new Error(
    `Unknown provider "${provider}". Expected one of: local, vercel, e2b, all.`
  );
}

async function createProvider(
  provider: ProviderName
): Promise<SandboxProvider> {
  switch (provider) {
    case "local": {
      const { LocalSandboxProvider } = await import(
        "../../src/sandbox-code-generator/local-sandbox-provider.js"
      );
      return await LocalSandboxProvider.create({
        sandboxDir: "./.sandbox-weather",
        cleanOnCreate: true,
      });
    }
    case "vercel": {
      const { VercelSandboxProvider } = await import(
        "../../src/sandbox-code-generator/vercel-sandbox-provider.js"
      );
      return await VercelSandboxProvider.create();
    }
    case "e2b": {
      const { E2BSandboxProvider } = await import(
        "../../src/sandbox-code-generator/e2b-sandbox-provider.js"
      );
      return await E2BSandboxProvider.create();
    }
    default:
      throw new Error(`Unsupported provider: ${provider satisfies never}`);
  }
}

async function runWeatherDemo(
  manager: SandboxManager,
  providerName: ProviderName,
  location: string
) {
  const provider = manager.getSandboxProvider();
  console.log(`→ Workspace path: ${provider.getWorkspacePath()}`);

  const generationResult: ToolCodeGenerationResult | undefined =
    manager.getStandardToolsResult();

  if (!generationResult) {
    console.warn("⚠️  No standard tools were generated.");
    return;
  }

  console.log("→ Generated files:");
  generationResult.files.forEach((file) => console.log(`   • ${file}`));

  await showDirectoryTree(provider, generationResult.outputDir);

  const toolFile = generationResult.files.find(
    (file) =>
      file.endsWith(".ts") &&
      !file.endsWith("index.ts") &&
      !file.endsWith("README.md")
  );

  if (toolFile) {
    console.log(`\n→ Preview of ${toolFile}:`);
    await printFileSnippet(provider, toolFile, 40);
  }

  const sampleResult = await weatherTool.execute?.(
    { location },
    { toolCallId: "weather-demo", messages: [] }
  );

  if (sampleResult) {
    console.log("\n→ Sample tool result:");
    console.log(JSON.stringify(sampleResult, null, 2));
  }

  console.log(
    `\n✓ Weather tool code ready inside ${providerName} sandbox: ${generationResult.outputDir}\n`
  );
}

async function showDirectoryTree(
  provider: SandboxProvider,
  directory: string
): Promise<void> {
  console.log(`\n→ Directory listing for ${directory}:`);
  const lsResult = await provider.runCommand({
    cmd: "ls",
    args: ["-R", directory],
  });
  const lsOutput = await lsResult.stdout();
  console.log(lsOutput || "(empty directory)");
}

async function printFileSnippet(
  provider: SandboxProvider,
  filePath: string,
  maxLines: number
): Promise<void> {
  const snippetResult = await provider.runCommand({
    cmd: "head",
    args: [`-n${maxLines}`, filePath],
  });

  const snippetOutput = await snippetResult.stdout();
  console.log(snippetOutput || "(no content)");
}

main().catch((error) => {
  console.error(
    `\n❌ Weather tool demo failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`
  );
  process.exit(1);
});
