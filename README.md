# ctx-zip

Keep your agent context small and cheap by applying proven context management techniques. ctx-zip helps you manage context bloat through tool output compaction with boundary control and progressive tool discovery—reducing token usage, lowering costs, and improving agent performance.

Works primarily with the AI SDK for agents and loop control. See: [AI SDK – Loop Control: Context Management](https://ai-sdk.dev/docs/agents/loop-control#context-management).

## The Problem: Context Bloat

As agents run longer conversations and use more tools, context windows fill up with:
- **Large tool outputs**: Search results, file contents, API responses that consume thousands of tokens
- **Tool definitions**: Hundreds or thousands of MCP tool schemas loaded upfront
- **Conversation history**: Every message accumulates, even when older context is no longer needed

This leads to:
- **Exhausted context windows**: Models hit token limits and fail mid-conversation
- **Higher costs**: More tokens = higher API costs
- **Slower responses**: Larger contexts increase latency
- **Reduced accuracy**: Models struggle with signal-to-noise ratio in bloated contexts

## Installation

```bash
npm i ctx-zip
# or
pnpm add ctx-zip
```

---

## Context Management Techniques

ctx-zip provides two complementary techniques for managing context efficiently. Use them individually or combine them for maximum effectiveness.

### Technique 1: Tool Output Compaction with Boundary Management

**What it does**: Automatically persists large tool outputs to storage and replaces them with concise references in the message history. You control which parts of the conversation get compacted through configurable boundary strategies.

**How it works**: 
1. Scans messages for tool results with large payloads
2. Writes outputs to the local filesystem as JSON files
3. Replaces the full output with a short reference like `Written to storage: file:///path/to/tool-result-001.json`
4. Provides reader tools (`readFile`, `grepAndSearchFile`) so agents can retrieve content on-demand
5. Uses boundary configuration to determine which messages to compact

**Benefits**:
- Reduces token usage by 60-90% for tool-heavy conversations
- Keeps conversation history lean while preserving access to data
- Works transparently with existing tools
- Flexible boundary control to preserve important context

**Example**:

```typescript
import { generateText, stepCountIs } from "ai";
import {
  compactMessages,
  createReadFileTool,
  createGrepAndSearchFileTool,
} from "ctx-zip";

const storageUri = `file://${process.cwd()}`;

const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools: {
    // Reader tools so the model can access persisted outputs
    readFile: createReadFileTool(),
    grepAndSearchFile: createGrepAndSearchFileTool(),
    
    // ... your other tools ...
  },
  stopWhen: stepCountIs(6),
  prompt: "Use tools to research, summarize, and cite sources.",
  prepareStep: async ({ messages }) => {
    // Compact tool outputs to storage with boundary control
    const compacted = await compactMessages(messages, {
      baseDir: storageUri,
      boundary: "last-turn", // Compact only the latest turn
    });
    
    return { messages: compacted };
  },
});
```

**How compaction works**:

The compaction algorithm:
1. Determines the compaction window based on the `boundary` configuration
2. Identifies tool result messages within that window
3. Extracts the output payload (JSON, text, or structured data)
4. Serializes it to a JSON file with metadata (tool name, timestamp, session ID)
5. Writes to the local filesystem using the configured directory
6. Replaces the message content with a reference string

**Reader tool recognition**: By default, `readFile` and `grepAndSearchFile` are recognized as reader tools. Their outputs are replaced with references to the source file rather than being re-written, preventing circular compaction.

**Boundary Strategies**:

The `boundary` option controls which parts of the conversation history get compacted:

**1. Last Turn (Default)**:
```typescript
boundary: "last-turn"
```
Compacts only messages since the last assistant/user text exchange. Keeps recent conversational context intact while compacting tool outputs from the current turn.

**2. Full History**:
```typescript
boundary: "all"
```
Re-compacts the entire conversation. Useful when you want to persist older tool outputs that weren't previously compacted.

**3. Keep First N Messages**:
```typescript
boundary: { type: "keep-first", count: 20 }
```
Preserves the first 20 messages (typically system instructions and initial setup) and compacts everything after. Perfect for preserving long-lived system prompts.

**4. Keep Last N Messages**:
```typescript
boundary: { type: "keep-last", count: 10 }
```
Preserves the last 10 messages (recent context) and compacts everything before them. Ideal for long-running loops where you want to maintain recent context while compacting older messages.

**Configuration**:

```typescript
interface CompactOptions {
  strategy?: "write-tool-results-to-file"; // Currently only strategy
  baseDir?: string | FileAdapter;          // Filesystem directory (file:// URI or FileAdapter instance)
  boundary?: Boundary;                     // Where to start compacting
  toolResultSerializer?: (value: unknown) => string; // Custom serialization
  fileReaderTools?: string[];             // Additional reader tool names
  sessionId?: string;                     // Organize files by session
}
```

**Combining with AI SDK Loop Control**:

Pair boundary management with AI SDK's `prepareStep` to implement a "last-N messages" strategy:

```typescript
prepareStep: async ({ messages }) => {
  // Keep only last 50 messages, compact older ones
  const recentMessages = messages.slice(-50);
  const compacted = await compactMessages(recentMessages, {
    baseDir: storageUri,
    boundary: { type: "keep-last", count: 10 },
  });
  
  return { messages: compacted };
}
```

**Use Cases**:

- **Preserve system instructions**: Use `keep-first` to maintain detailed system prompts
- **Maintain recent context**: Use `keep-last` for conversational agents that need recent memory
- **Incremental compaction**: Use `last-turn` to compact only new tool outputs each step
- **Full re-compaction**: Use `all` when reorganizing files or re-compacting the entire conversation

---

### Technique 2: Progressive Tool Discovery (MCP Sandbox Explorer)

**What it does**: Transforms MCP tool definitions into a discoverable file system in a sandbox, enabling agents to explore and use tools on-demand instead of loading all definitions upfront.

**How it works**:
1. Connects to MCP servers and fetches tool definitions
2. Converts JSON Schema to TypeScript modules with JSDoc documentation
3. Generates a file system in a sandbox (Vercel, E2B, or Local)
4. Provides exploration tools (ls, cat, grep, find) for progressive discovery
5. Enables code execution in the sandbox, letting agents compose multiple tool calls and process data before returning results

**The Problem It Solves**:

Traditional MCP integration loads all tool definitions upfront. With hundreds or thousands of tools across multiple servers:
- Tool schemas consume hundreds of thousands of tokens before your prompt
- Every tool definition passes through the model context
- Intermediate tool results bloat the conversation
- Costs and latency increase dramatically

**The Solution**:

Instead of loading everything upfront:
1. **Tool definitions live in sandbox filesystem**: Not in model context
2. **Agents explore on-demand**: Use `sandbox_cat` to read tool definitions when needed
3. **Code execution in sandbox**: Write TypeScript that imports and calls MCP tools
4. **Data processing stays local**: Filter, transform, aggregate in sandbox before returning
5. **Only final results in context**: Intermediate data never touches the model

**Result**: 80%+ reduction in token usage for complex multi-tool workflows.

**Example**:

```typescript
import { generateText, stepCountIs } from "ai";
import { MCPSandboxExplorer } from "ctx-zip";

// Initialize with MCP servers
const explorer = await MCPSandboxExplorer.create({
  servers: [
    { name: "grep-app", url: "https://mcp.grep.app" },
    { 
      name: "linear", 
      url: "https://mcp.linear.app/mcp",
      headers: {
        Authorization: `Bearer ${process.env.LINEAR_OAUTH_TOKEN}`,
      },
    },
  ],
  // Uses Vercel sandbox by default
});

// Generate file system with tool definitions
await explorer.generateFileSystem();

// Get AI SDK tools for exploration and execution
const tools = explorer.getAllTools();

// Agent can now explore and use MCP tools
const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools,
  stopWhen: stepCountIs(15),
  prompt: "Search the codebase using grep-app and create a Linear issue",
});

console.log(result.text);

// Cleanup
await explorer.cleanup();
```

**How Tool Transformation Works**:

1. **Fetch**: Connects to MCP servers via HTTP/SSE and calls `listTools()`
2. **Convert**: Transforms JSON Schema to TypeScript interfaces with:
   - Input/output type definitions
   - JSDoc documentation extracted from schema descriptions
   - Usage examples generated from schema properties
3. **Generate**: Creates a file tree:
   ```
   servers/
   ├── grep-app/
   │   ├── search.ts           # Tool function + types
   │   ├── getFileContent.ts
   │   └── index.ts            # Re-exports
   ├── linear/
   │   ├── createIssue.ts
   │   └── index.ts
   └── _client.ts              # MCP routing client
   ```
4. **Execute**: Agents write TypeScript that imports tools and calls them:
   ```typescript
   import { search } from './servers/grep-app/index.ts';
   import { createIssue } from './servers/linear/index.ts';
   
   const results = await search({ query: 'authentication' });
   // Process results in sandbox
   const filtered = results.filter(/* ... */);
   // Only return final summary to model
   return filtered;
   ```

**Available Sandbox Tools**:

- **sandbox_ls**: List directory contents
- **sandbox_cat**: Read file contents (view tool definitions)
- **sandbox_grep**: Search for patterns in files
- **sandbox_find**: Find files by name pattern
- **sandbox_exec**: Execute TypeScript code in the sandbox

**Sandbox Providers**:

**Vercel Sandbox** (Default):
```typescript
import { MCPSandboxExplorer } from "ctx-zip";

const explorer = await MCPSandboxExplorer.create({
  servers: [/* ... */],
  sandboxOptions: {
    timeout: 1800000,  // 30 minutes
    runtime: "node22",
    vcpus: 4,
  },
});
```

**E2B Sandbox**:
```typescript
import { MCPSandboxExplorer, E2BSandboxProvider } from "ctx-zip";

const provider = await E2BSandboxProvider.create({
  apiKey: process.env.E2B_API_KEY,
});

const explorer = await MCPSandboxExplorer.create({
  servers: [/* ... */],
  sandboxProvider: provider,
});
```

**Local Sandbox** (For Development):
```typescript
import { MCPSandboxExplorer, LocalSandboxProvider } from "ctx-zip";

const provider = await LocalSandboxProvider.create({
  sandboxDir: "./.sandbox", // Inspect files directly!
});

const explorer = await MCPSandboxExplorer.create({
  servers: [/* ... */],
  sandboxProvider: provider,
});
```

**Benefits**:
- **Massive token savings**: Load only tools you need, not thousands upfront
- **Faster responses**: Smaller context windows = lower latency
- **Lower costs**: Process data in sandbox, not through expensive LLM calls
- **Better privacy**: Sensitive data stays in sandbox
- **Progressive discovery**: Agents explore APIs on-demand
- **Tool composition**: Chain multiple MCP calls in single execution
- **Data processing**: Filter, transform, aggregate before returning

**Authentication**:

MCP servers requiring authentication can be configured with headers:

```typescript
const explorer = await MCPSandboxExplorer.create({
  servers: [
    {
      name: "linear",
      url: "https://mcp.linear.app/mcp",
      headers: {
        Authorization: `Bearer ${process.env.LINEAR_OAUTH_TOKEN}`,
      },
    },
  ],
});
```

**Note**: For OAuth-based servers, obtain tokens through the provider's OAuth flow (outside the sandbox) beforehand. Interactive OAuth flows are not supported inside sandbox environments.

---

## Storage for Compaction

ctx-zip uses the local filesystem to persist tool outputs during compaction. Tool results are written as JSON files that can be read back using the `readFile` and `grepAndSearchFile` tools.

### Local Filesystem

Compaction writes tool outputs to the local filesystem. You can specify a directory using a `file://` URI or by constructing a `FileAdapter` instance.

**Using a URI**:
```typescript
await compactMessages(messages, { 
  baseDir: "file:///var/tmp/ctx-zip" 
});
```

**Using FileAdapter**:
```typescript
import { FileAdapterClass as FileAdapter } from "ctx-zip";

await compactMessages(messages, {
  baseDir: new FileAdapter({ baseDir: "/var/tmp/ctx-zip" }),
});
```

**Default behavior**: If `baseDir` is omitted, files are written to `process.cwd()`.

**File organization**: Files are organized as `{baseDir}/{sessionId}/tool-results/{toolName}-{seq}.json`

### Session-Based Organization

Organize tool results by session for better file management:

```typescript
import { FileAdapterClass as FileAdapter } from "ctx-zip";

const storageAdapter = new FileAdapter({
  baseDir: "/path/to/storage",
  sessionId: "my-session-123",
});

await compactMessages(messages, {
  baseDir: storageAdapter,
  sessionId: "my-session-123",
});
```

Files will be organized as:
- Path: `{baseDir}/{sessionId}/tool-results/{toolName}-{seq}.json`
- Example: `.ctx-storage/my-session-123/tool-results/fetchEmails-001.json`

**Note**: For serverless deployments or distributed systems, ensure the filesystem is accessible across all instances, or use a shared filesystem mount.

---

## Combining Techniques

For maximum effectiveness, combine both techniques:

```typescript
import { generateText, stepCountIs } from "ai";
import {
  compactMessages,
  createReadFileTool,
  createGrepAndSearchFileTool,
  MCPSandboxExplorer,
} from "ctx-zip";

// 1. Set up MCP Sandbox Explorer for progressive tool discovery
const explorer = await MCPSandboxExplorer.create({
  servers: [
    { name: "grep-app", url: "https://mcp.grep.app" },
  ],
});

await explorer.generateFileSystem();
const sandboxTools = explorer.getAllTools();

// 2. Set up compaction with reader tools and boundary management
const storageUri = `file://${process.cwd()}`;
const readerTools = {
  readFile: createReadFileTool(),
  grepAndSearchFile: createGrepAndSearchFileTool(),
};

const result = await generateText({
  model: "openai/gpt-4.1-mini",
  tools: {
    ...sandboxTools,      // Progressive discovery tools
    ...readerTools,       // Compaction reader tools
    // ... your other tools
  },
  stopWhen: stepCountIs(20),
  prompt: "Research and summarize findings",
  prepareStep: async ({ messages }) => {
    // Apply compaction with boundary management
    const compacted = await compactMessages(messages, {
      baseDir: storageUri,
      boundary: { type: "keep-last", count: 15 }, // Preserve recent context
    });
    
    return { messages: compacted };
  },
});

await explorer.cleanup();
```

This approach:
- Uses progressive discovery to avoid loading all MCP tools upfront
- Compacts tool outputs to keep context lean
- Preserves recent context while compacting older messages
- Provides reader tools for on-demand access to persisted data

---

## API Reference

### Compaction

- **`compactMessages(messages, options)`**: Compact messages by persisting tool outputs
- **`CompactOptions`**: Configuration interface for compaction
- **`Boundary`**: Type for boundary strategies

### Tools

- **`createReadFileTool(options?)`**: Tool for reading persisted files
- **`createGrepAndSearchFileTool(options?)`**: Tool for searching persisted files

### MCP Sandbox Explorer

- **`MCPSandboxExplorer.create(config)`**: Initialize sandbox explorer
- **`MCPSandboxExplorer.generateFileSystem()`**: Fetch tools and generate file system
- **`MCPSandboxExplorer.getAllTools()`**: Get all exploration and execution tools
- **`MCPSandboxExplorer.cleanup()`**: Stop sandbox and clean up

### Sandbox Providers

- **`VercelSandboxProvider.create(options)`**: Create Vercel sandbox
- **`E2BSandboxProvider.create(options)`**: Create E2B sandbox
- **`LocalSandboxProvider.create(options)`**: Create local sandbox

### Storage

- **`FileAdapter`**: Interface for filesystem storage adapters
- **`createFileAdapter(uriOrAdapter)`**: Create filesystem adapter from `file://` URI or FileAdapter instance
- **`FileAdapterClass`**: Base class for filesystem adapters

### Utilities

- **`detectWindowStart(messages, boundary)`**: Determine compaction window start
- **`messageHasTextContent(message)`**: Check if message has text content
- **`grepObject(adapter, key, regex)`**: Search persisted files

---

## Examples

The library includes complete working examples:

```bash
# MCP Sandbox Explorer examples
npm run example:mcp-vercel  # Vercel sandbox
npm run example:mcp-e2b     # E2B sandbox
npm run example:mcp-local   # Local sandbox (great for debugging)
```

See the [`examples/`](./examples/) directory for detailed examples with comments.

---

## Tips

- **Start with local filesystem**: Use `file://` URIs to specify storage directories for compaction
- **Combine techniques**: Use compaction with boundary management + progressive discovery for maximum efficiency
- **Preserve system instructions**: Use `keep-first` boundary to maintain detailed system prompts
- **Monitor token usage**: Track before/after token counts to measure effectiveness
- **Use session IDs**: Organize persisted files by session for easier debugging and cleanup
- **Pair with AI SDK loop control**: Use `prepareStep` to implement custom message retention strategies

---

Built with ❤️ by the team behind [Langtrace](https://langtrace.ai) and [Zest](https://heyzest.ai).
