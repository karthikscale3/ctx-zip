# ctx-zip

Keep your AI agent context small and cheap by managing tool bloat and large outputs. ctx-zip provides two complementary techniques: **Tool Discovery** (transform MCP servers and tools into explorable code) and **Output Compaction** (persist large results to storage with smart retrieval).

Works with the AI SDK for agents and loop control. See: [AI SDK – Loop Control: Context Management](https://ai-sdk.dev/docs/agents/loop-control#context-management).

## Installation

```bash
npm i ctx-zip
# or
pnpm add ctx-zip
```

---

## What It Does

ctx-zip tackles two major context problems:

### 1. **Tool Discovery & Code Generation**
Transforms MCP servers and AI SDK tools into inspectable TypeScript code in a sandbox. Instead of loading hundreds of tool schemas upfront, agents explore tools on-demand using filesystem operations.

**The Problem:**

Context Rot
- Tool schemas consume thousands of tokens before your prompt
- Every tool output is pulled into the model context
- Every tool definition passes through model context
- Agents can't inspect implementations to understand behavior

**The Solution:**
- Tools are transformed to importable code that live in the sandbox filesystem (not in context)
- Progressive Exploration: Agents explore the file system on-demand with `sandbox_ls`, `sandbox_cat`, `sandbox_grep`
- Agents write and execute code that combines multiple tools
- **Result**: Higher reliability, fast and ~80%+ token reduction for multi-tool workflows

### 2. **Output Compaction with Smart Retrieval**
Automatically persists large tool outputs to the sandbox filesystem and replaces them with concise references. Agents can retrieve content on-demand using the same sandbox exploration tools.

**The Problem:**

Context Rot
- Large tool outputs (search results, file contents, API responses) bloat context
- Conversation history accumulates thousands of unused tokens
- Context windows exhaust, costs increase, performance degrades

**The Solution:**
- Tool outputs are automatically written to the sandbox filesystem
- Replaced with short references in conversation
- Agents retrieve data on-demand with sandbox exploration tools (`sandbox_ls`, `sandbox_cat`, `sandbox_grep`, `sandbox_find`)
- **Result**: ~60-90% token reduction for tool-heavy conversations

---

## How It Works

### Technique 1: Tool Discovery & Code Generation

Transform tools into explorable code that agents can inspect and execute:

```typescript
import { generateText, tool } from "ai";
import { z } from "zod";
import { SandboxManager, E2BSandboxProvider } from "ctx-zip";

// Step 1: Create a sandbox
const sandboxProvider = await E2BSandboxProvider.create();
const manager = await SandboxManager.create({ sandboxProvider });

// Step 2: Register MCP servers and/or AI SDK tools
await manager.register({
  servers: [
    { name: "grep-app", url: "https://mcp.grep.app" },
    { 
      name: "linear", 
      url: "https://mcp.linear.app/mcp",
      headers: { Authorization: `Bearer ${process.env.LINEAR_TOKEN}` }
    },
  ],
  standardTools: {
    weather: tool({
      description: "Get the weather in a location",
      inputSchema: z.object({
        location: z.string(),
      }),
      async execute({ location }) {
        const temp = 72 + Math.floor(Math.random() * 21) - 10;
        return { location, temperature: temp, units: "°F" };
      },
    }),
  },
});

// Step 3: Get exploration and execution tools
const tools = manager.getAllTools();
// Available: sandbox_ls, sandbox_cat, sandbox_grep, sandbox_find, sandbox_exec

// Step 4: Agent explores and uses tools
const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools,
  prompt: "Search the codebase, check the weather, and create a Linear issue",
});

console.log(result.text);

// Cleanup
await manager.cleanup();
```

**What Gets Generated:**

The `register()` call creates a directory structure in the sandbox:

```
/workspace/
├── mcp/              # MCP tool implementations
│   ├── grep-app/
│   │   ├── search.ts
│   │   ├── index.ts
│   │   └── _types.ts
│   ├── linear/
│   │   ├── createIssue.ts
│   │   ├── searchIssues.ts
│   │   └── index.ts
│   └── _client.ts       # MCP routing client
├── local-tools/         # AI SDK tool implementations
│   ├── weather.ts
│   └── index.ts
├── user-code/          # Agent execution workspace
└── compact/            # Tool output storage (for compaction)
```

**Exploration Tools:**

Once tools are registered, agents can explore them:

- `sandbox_ls(path)` - List directory contents
- `sandbox_cat(path)` - Read file contents
- `sandbox_grep(pattern, path)` - Search in files
- `sandbox_find(pattern, path)` - Find files by name
- `sandbox_exec(code)` - Execute TypeScript code

**Example Agent Workflow:**

```typescript
// Agent explores available tools
await sandbox_ls("/workspace/mcp")
// → ["grep-app/", "linear/", "_client.ts"]

await sandbox_ls("/workspace/local-tools")
// → ["weather.ts", "index.ts"]

// Agent inspects a tool
await sandbox_cat("/workspace/mcp/grep-app/search.ts")
// → Full TypeScript source with types and documentation

// Agent writes code to use multiple tools together
await sandbox_exec(`
  import { search } from './mcp/grep-app/index.ts';
  import { createIssue } from './mcp/linear/index.ts';
  import { weather } from './local-tools/index.ts';
  
  const results = await search({ query: 'authentication bug' });
  const topResult = results[0];
  const weatherData = await weather({ location: 'San Francisco' });
  
  await createIssue({
    title: 'Fix auth bug from codebase search',
    description: \`Found issue: \${topResult.content}\nWeather: \${weatherData.temperature}\`,
  });
  
  return { created: true, result: topResult.file };
`);
```

**API Reference:**

```typescript
// Create manager
const manager = await SandboxManager.create({
  sandboxProvider?: SandboxProvider,  // E2B, Vercel, or Local
  sandboxOptions?: LocalSandboxOptions, // If no provider
});

// Register tools
await manager.register({
  servers?: MCPServerConfig[],        // MCP servers to connect
  standardTools?: Record<string, Tool>, // AI SDK tools
  standardToolOptions?: {
    title?: string,
    outputDir?: string,
  },
});

// Get tools
manager.getAllTools()           // Exploration + execution tools
manager.getExplorationTools()   // ls, cat, grep, find (for MCP tools, defaults to mcp dir)
manager.getCompactionTools()    // ls, cat, grep, find (for compacted files, defaults to workspace root)
manager.getExecutionTool()      // Only exec

// Get paths
manager.getMcpDir()         // /workspace/mcp
manager.getLocalToolsDir()      // /workspace/local-tools
manager.getUserCodeDir()        // /workspace/user-code
manager.getCompactDir()         // /workspace/compact
manager.getWorkspacePath()      // /workspace

// Cleanup
await manager.cleanup()
```

---

### Technique 2: Output Compaction with Smart Retrieval

Automatically reduce context size by managing large tool outputs. Two strategies available: **write-to-file** (persist to storage with on-demand retrieval) or **drop-results** (remove outputs entirely).

```typescript
import { generateText, tool } from "ai";
import { z } from "zod";
import { compact, SandboxManager } from "ctx-zip";

// Create sandbox manager
const manager = await SandboxManager.create();
const fileAdapter = manager.getFileAdapter({ sessionId: "my-session" });

const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools: {
    // Compaction tools for reading compacted files using exact paths
    ...manager.getCompactionTools(),
    
    // Your data-generating tools
    fetchEmails: tool({
      description: "Fetch emails from inbox",
      inputSchema: z.object({ limit: z.number() }),
      async execute({ limit }) {
        const emails = await getEmails(limit);
        return { emails }; // This will be compacted
      },
    }),
  },
  prompt: "Check my latest emails and find any about 'budget'",
  prepareStep: async ({ messages }) => {
    // Compact outputs after each turn (default: write-tool-results-to-file)
    const compacted = await compact(messages, {
      strategy: "write-tool-results-to-file", // or "drop-tool-results"
      storage: fileAdapter, // Required for write-tool-results-to-file
      boundary: "all",
      sessionId: "my-session",
    });
    
    return { messages: compacted };
  },
});

await manager.cleanup();
```

**Compaction Strategies:**

ctx-zip provides two strategies for managing tool outputs:

#### Strategy 1: `write-tool-results-to-file` (Default)

Persists tool outputs to storage and replaces them with references. Agents can retrieve data on-demand.

**How it works:**

1. **Agent calls a tool** (e.g., `fetchEmails(50)`)
2. **Large output returned** (50 emails = 10,000 tokens)
3. **`compact()` runs in `prepareStep`:**
   - Detects large tool output
   - Writes to storage: `/compact/my-session/tool-results/fetchEmails.json`
   - Replaces output with reference:
     ```
     Written to file: file:///path/compact/my-session/tool-results/fetchEmails.json
     Key: compact/my-session/tool-results/fetchEmails.json
     Use the read/search tools to inspect its contents.
     ```
4. **Agent can retrieve data:**
   - `sandbox_ls(path)` - List directory contents
   - `sandbox_cat(file)` - Read entire file
   - `sandbox_grep(pattern, path)` - Search within files
   - `sandbox_find(pattern, path)` - Find files by name pattern

**When to use:** When you need agents to access historical tool outputs later in the conversation.

#### Strategy 2: `drop-tool-results`

Removes tool outputs entirely from the conversation, replacing them with a simple message indicating the output was dropped.

**How it works:**

1. **Agent calls a tool** (e.g., `fetchEmails(50)`)
2. **Large output returned** (50 emails = 10,000 tokens)
3. **`compact()` runs in `prepareStep`:**
   - Detects tool output
   - Replaces output with: `"Results dropped for tool: fetchEmails to preserve context"`
   - No storage required - outputs are permanently removed

**When to use:** When tool outputs are only needed for immediate processing and don't need to be referenced later. Maximum token savings, simplest setup.

**Storage Location** (write-tool-results-to-file only):

When using `SandboxManager` with `write-tool-results-to-file` strategy:

```
/workspace/
└── compact/
    └── {sessionId}/
        └── tool-results/
            ├── fetchEmails.json
            ├── searchGitHub.json
            └── getWeather.json
```

Each tool overwrites its own file on subsequent calls (one file per tool type).

**Note:** The `drop-tool-results` strategy doesn't use storage - outputs are removed from the conversation entirely.

**Boundary Strategies:**

Control which messages get compacted:

```typescript

// 1. All messages - re-compact entire conversation
boundary: "all"

// 2. Keep first N - preserve system prompt, compact rest
boundary: { type: "keep-first", count: 5 }

// 3. Keep last N - preserve recent context, compact older
boundary: { type: "keep-last", count: 20 }
```

**Sandbox Tools for Retrieval** (write-tool-results-to-file only):

When using `write-tool-results-to-file`, use compaction-specific tools that default to the workspace root:

```typescript
const manager = await SandboxManager.create();
const tools = manager.getCompactionTools();
// Available: sandbox_ls, sandbox_cat, sandbox_grep, sandbox_find
// These default to workspace root for easy use with compaction paths

// The compaction message tells you exactly how to read the file:
// "Written to file: sandbox://... To read it, use: sandbox_cat({ file: "compact/..." })"
// Just copy the path from the message!
```

**Note:** The `drop-tool-results` strategy doesn't require retrieval tools since outputs are permanently removed.

**Example: Drop Strategy (No Storage Required)**

```typescript
import { generateText, tool } from "ai";
import { z } from "zod";
import { compact } from "ctx-zip";

const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools: {
    fetchEmails: tool({
      description: "Fetch emails from inbox",
      inputSchema: z.object({ limit: z.number() }),
      async execute({ limit }) {
        const emails = await getEmails(limit);
        return { emails }; // This will be dropped
      },
    }),
  },
  prompt: "Summarize my latest emails",
  prepareStep: async ({ messages }) => {
    // Drop tool outputs - no storage needed
    const compacted = await compact(messages, {
      strategy: "drop-tool-results",
      boundary: "all",
    });
    
    return { messages: compacted };
  },
});
```

**API Reference:**

```typescript
// Compact messages
const compacted = await compact(messages, {
  strategy?: "write-tool-results-to-file" | "drop-tool-results", // Default: write-tool-results-to-file
  storage?: FileAdapter | string,    // Required for write-tool-results-to-file, ignored for drop-tool-results
  boundary?: Boundary,               // Which messages to compact
  sessionId?: string,                // Organize by session (write-tool-results-to-file only)
  fileReaderTools?: string[],        // Tools that read (not persisted, write-tool-results-to-file only)
});
```

---

## Combining Both Techniques

Use tool discovery and compaction together for maximum efficiency:

```typescript
import { generateText } from "ai";
import { 
  SandboxManager,
  compact,
  E2BSandboxProvider,
} from "ctx-zip";

// Step 1: Setup sandbox with tools
const sandboxProvider = await E2BSandboxProvider.create();
const manager = await SandboxManager.create({ sandboxProvider });

await manager.register({
  servers: [
    { name: "grep-app", url: "https://mcp.grep.app" },
  ],
});

// Step 2: Get file adapter for compaction
const fileAdapter = manager.getFileAdapter({
  sessionId: "combined-session",
});

// Step 3: Get all sandbox tools (exploration + execution)
// These same tools are used for both tool discovery AND accessing compacted outputs
const tools = manager.getAllTools();

// Step 4: Use in agent loop with compaction
const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools,
  prompt: "Search for authentication bugs in the codebase and summarize",
  prepareStep: async ({ messages }) => {
    const compacted = await compact(messages, {
      strategy: "write-tool-results-to-file", // or "drop-tool-results"
      storage: fileAdapter, // Required for write-tool-results-to-file
      boundary: "all",
      sessionId: "combined-session",
    });
    return { messages: compacted };
  },
});

console.log(result.text);
await manager.cleanup();
```

**Benefits:**
- MCP tools explored on-demand (no upfront schema loading)
- Large search results compacted to sandbox storage
- Same exploration tools work for both tool discovery and compacted output retrieval
- Maximum token efficiency and simplified API

---

## Sandbox Providers

ctx-zip supports three sandbox environments:

### Local Sandbox (Default)

```typescript
import { SandboxManager, LocalSandboxProvider } from "ctx-zip";

// Option 1: Let SandboxManager create default local sandbox
const manager = await SandboxManager.create();

// Option 2: Explicit local provider
const provider = await LocalSandboxProvider.create({
  sandboxDir: "./.sandbox",
  cleanOnCreate: false,
});
const manager = await SandboxManager.create({ sandboxProvider: provider });
```

### E2B Sandbox

```typescript
import { SandboxManager, E2BSandboxProvider } from "ctx-zip";

const provider = await E2BSandboxProvider.create({
  apiKey: process.env.E2B_API_KEY,
  timeout: 1800000, // 30 minutes
});

const manager = await SandboxManager.create({ sandboxProvider: provider });
```

### Vercel Sandbox

```typescript
import { SandboxManager, VercelSandboxProvider } from "ctx-zip";

const provider = await VercelSandboxProvider.create({
  timeout: 1800000,
  runtime: "node22",
  vcpus: 4,
});

const manager = await SandboxManager.create({ sandboxProvider: provider });
```

---

## Examples

See the `examples/` directory:

- **`examples/mcp/`** - MCP server integration with grep.app
  - `local_mcp_search.ts` - Local sandbox
  - `e2b_mcp_search.ts` - E2B sandbox
  - `vercel_mcp_search.ts` - Vercel sandbox
  
- **`examples/tools/`** - AI SDK tool transformation
  - `weather_tool_sandbox.ts` - Transform and explore standard tools

- **`examples/ctx-management/`** - Full-featured compaction demo
  - `email_management.ts` - Interactive email assistant with multi-environment support

---

## API Overview

### SandboxManager

```typescript
class SandboxManager {
  // Create
  static async create(config?: {
    sandboxProvider?: SandboxProvider,
    sandboxOptions?: LocalSandboxOptions,
  }): Promise<SandboxManager>

  // Register tools
  async register(options: {
    servers?: MCPServerConfig[],
    standardTools?: Record<string, Tool>,
    standardToolOptions?: ToolCodeGenerationOptions,
  }): Promise<void>

  // Get tools
  getAllTools(): Record<string, Tool>
  getExplorationTools(): Record<string, Tool>
  getExecutionTool(): Record<string, Tool>

  // Get paths
  getMcpDir(): string
  getLocalToolsDir(): string
  getUserCodeDir(): string
  getCompactDir(): string
  getWorkspacePath(): string

  // File adapter for compaction
  getFileAdapter(options?: {
    prefix?: string,
    sessionId?: string,
  }): FileAdapter

  // Static helper
  static createLocalFileAdapter(options: LocalFileAdapterOptions): FileAdapter

  // Cleanup
  async cleanup(): Promise<void>
}
```

### Compaction

```typescript
function compact(
  messages: ModelMessage[],
  options: CompactOptions
): Promise<ModelMessage[]>

interface CompactOptions {
  strategy?: "write-tool-results-to-file" | "drop-tool-results",
  storage?: FileAdapter | string,  // Required for write-tool-results-to-file
  boundary?: Boundary,
  sessionId?: string,               // write-tool-results-to-file only
  fileReaderTools?: string[],        // write-tool-results-to-file only
}

type Boundary = 
  | "all"
  | { type: "keep-first"; count: number }
  | { type: "keep-last"; count: number }
```

---

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  SandboxProvider,
  FileAdapter,
  CompactOptions,
  Boundary,
  E2BSandboxOptions,
  LocalSandboxOptions,
  VercelSandboxOptions,
} from "ctx-zip";
```

---

## License

MIT

---

## Contributing

Contributions welcome! Please open an issue or PR.
