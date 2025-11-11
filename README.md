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
Automatically persists large tool outputs to the file system and replaces them with concise references. Agents can retrieve content on-demand using reader tools.

**The Problem:**

Context Rot
- Large tool outputs (search results, file contents, API responses) bloat context
- Conversation history accumulates thousands of unused tokens
- Context windows exhaust, costs increase, performance degrades

**The Solution:**
- Tool outputs are automatically written to the file system (local filesystem or sandbox)
- Replaced with short references in conversation
- Agents retrieve data on-demand with `readFile` and `grepAndSearchFile`
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
├── servers/              # MCP tool implementations
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
await sandbox_ls("/workspace/servers")
// → ["grep-app/", "linear/", "_client.ts"]

await sandbox_ls("/workspace/local-tools")
// → ["weather.ts", "index.ts"]

// Agent inspects a tool
await sandbox_cat("/workspace/servers/grep-app/search.ts")
// → Full TypeScript source with types and documentation

// Agent writes code to use multiple tools together
await sandbox_exec(`
  import { search } from './servers/grep-app/index.ts';
  import { createIssue } from './servers/linear/index.ts';
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
manager.getExplorationTools()   // Only ls, cat, grep, find
manager.getExecutionTool()      // Only exec

// Get paths
manager.getServersDir()         // /workspace/servers
manager.getLocalToolsDir()      // /workspace/local-tools
manager.getUserCodeDir()        // /workspace/user-code
manager.getCompactDir()         // /workspace/compact
manager.getWorkspacePath()      // /workspace

// Cleanup
await manager.cleanup()
```

---

### Technique 2: Output Compaction with Smart Retrieval

Automatically persist large tool outputs and provide retrieval tools:

```typescript
import { generateText } from "ai";
import { 
  compact, 
  createReadFileTool, 
  createGrepAndSearchFileTool,
  SandboxManager,
} from "ctx-zip";

// For local filesystem storage
const fileAdapter = SandboxManager.createLocalFileAdapter({
  baseDir: process.cwd(),
  sessionId: "my-session",
});

const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools: {
    // Reader tools for accessing compacted outputs
    readFile: createReadFileTool({ storage: fileAdapter }),
    grepAndSearchFile: createGrepAndSearchFileTool({ storage: fileAdapter }),
    
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
    // Compact outputs after each turn
    const compacted = await compact(messages, {
      storage: fileAdapter,
      boundary: "all",
      sessionId: "my-session",
    });
    
    return { messages: compacted };
  },
});
```

**How Compaction Works:**

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
   - `readFile(key)` - Read entire file
   - `grepAndSearchFile(key, pattern)` - Search within file

**Storage Location:**

When using `SandboxManager` with compaction:

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

**Boundary Strategies:**

Control which messages get compacted:

```typescript

// 2. All messages - re-compact entire conversation
boundary: "all"

// 3. Keep first N - preserve system prompt, compact rest
boundary: { type: "keep-first", count: 5 }

// 4. Keep last N - preserve recent context, compact older
boundary: { type: "keep-last", count: 20 }
```

**Reader Tools:**

Both tools accept a `storage` option:

```typescript
// Option 1: Use FileAdapter instance (recommended)
const fileAdapter = SandboxManager.createLocalFileAdapter({
  baseDir: "/path/to/storage",
  sessionId: "my-session",
});

createReadFileTool({ storage: fileAdapter })
createGrepAndSearchFileTool({ storage: fileAdapter })

// Option 2: Use URI string
createReadFileTool({ storage: "file:///path/to/storage" })
createGrepAndSearchFileTool({ storage: "file:///path/to/storage" })
```

**API Reference:**

```typescript
// Compact messages
const compacted = await compact(messages, {
  storage: FileAdapter | string,    // Where to write files
  boundary?: Boundary,               // Which messages to compact
  sessionId?: string,                // Organize by session
  fileReaderTools?: string[],        // Tools that read (not persisted)
});

// Create reader tools
const readFile = createReadFileTool({
  storage?: FileAdapter | string,    // Defaults to cwd
  description?: string,              // Custom description
});

const grepTool = createGrepAndSearchFileTool({
  storage?: FileAdapter | string,    // Defaults to cwd
  description?: string,              // Custom description
});

// Create local file adapter
const adapter = SandboxManager.createLocalFileAdapter({
  baseDir: string,                   // Absolute directory path
  prefix?: string,                   // Subdirectory (default: "compact")
  sessionId?: string,                // Session organization
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
  createReadFileTool,
  createGrepAndSearchFileTool,
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

// Step 3: Combine exploration + reader tools
const tools = {
  ...manager.getAllTools(),                              // Exploration + execution
  readFile: createReadFileTool({ storage: fileAdapter }),
  grepAndSearchFile: createGrepAndSearchFileTool({ storage: fileAdapter }),
};

// Step 4: Use in agent loop with compaction
const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools,
  prompt: "Search for authentication bugs in the codebase and summarize",
  prepareStep: async ({ messages }) => {
    const compacted = await compact(messages, {
      storage: fileAdapter,
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
- Large search results compacted to storage
- Agents retrieve only what they need
- Maximum token efficiency

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
  getServersDir(): string
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
  storage: FileAdapter | string,
  boundary?: Boundary,
  sessionId?: string,
  fileReaderTools?: string[],
}

type Boundary = 
  | "all"
  | { type: "keep-first"; count: number }
  | { type: "keep-last"; count: number }
```

### Reader Tools

```typescript
function createReadFileTool(options?: {
  storage?: FileAdapter | string,
  description?: string,
}): Tool

function createGrepAndSearchFileTool(options?: {
  storage?: FileAdapter | string,
  description?: string,
}): Tool
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
