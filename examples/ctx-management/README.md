# Context Management Examples

These examples demonstrate **context compression** - efficiently storing and retrieving AI tool call results to reduce token usage and costs.

## 🎯 What is Context Compression?

When AI agents make tool calls, the results can be very large (e.g., database queries, API responses). Instead of passing full results to the AI model (consuming tokens), we:

1. **Compress** tool results into compact format
2. **Store** in the local file system as structured JSON
3. **Generate** compact references for the AI
4. **Retrieve** full data only when needed via read/search tools

**Result:** Reduce token usage by 50-90% while maintaining full functionality.

## 📁 Examples

### `local_file.ts` - File Storage with Sessions

**Purpose:** Store compressed tool results in the local file system with session-based organization.

```bash
npm run example:ctx-local
```

**What it does:**
```typescript
import { FileAdapterClass as FileAdapter, compactMessages } from "ctx-zip";

// Create file adapter with session support
const fileAdapter = new FileAdapter({
  baseDir: path.resolve(process.cwd(), ".ctx-storage"),
  sessionId: "my-session-123"
});

// Compress and store
const compacted = await compactMessages(conversation, {
  baseDir: fileAdapter,
  boundary: "all",
  sessionId: "my-session-123"
});
```

**File Structure:**
```
.ctx-storage/
└── my-session-123/
    └── tool-results/
        ├── fetchEmails-001.json
        ├── fetchEmails-002.json
        └── searchDocuments-001.json
```

**JSON Format with Metadata:**
```json
{
  "metadata": {
    "toolName": "fetchEmails",
    "timestamp": "2025-11-08T10:30:00.000Z",
    "toolCallId": "call_abc123",
    "sessionId": "my-session-123"
  },
  "output": {
    "emails": [...],
    "meta": {...}
  }
}
```

**Benefits:**
- ✅ Simple file-based storage
- ✅ Session-organized for easy debugging
- ✅ Structured JSON with full metadata
- ✅ Sequential naming for readability
- ✅ No external dependencies

**Use cases:**
- Development and testing
- Single-machine workflows
- Sandboxed environments
- Local AI agents

---

## 📊 Token Savings Example

### Without Context Compression

```typescript
// Tool returns 50KB of email data
const result = await generateText({
  model: openai("gpt-4o-mini"),
  tools: { fetchEmails }
});

// AI model receives full 50KB (~12,500 tokens)
// Cost: ~$0.0015 per call
```

### With Context Compression

```typescript
// Tool returns 50KB, compressed to storage reference
const compacted = await compactMessages(messages, {
  baseDir: storageAdapter,
  sessionId: "my-session"
});

// AI model receives compact reference (~50 tokens)
// Example: "Written to file: file:///path/to/.ctx-storage/my-session/tool-results/fetchEmails-001.json"
// Cost: ~$0.00006 per call
// Savings: ~96% reduction in tokens!
```

## 🔧 How It Works

### 1. Tool Execution
```typescript
const emails = await fetchEmails(); // Returns large dataset
```

### 2. Compression & Storage
```typescript
// Automatically persists to JSON with metadata
// File: .ctx-storage/session-abc/tool-results/fetchEmails-001.json
```

### 3. AI Receives Reference
```typescript
// AI sees: "Written to file: file:///.ctx-storage/session-abc/tool-results/fetchEmails-001.json. Key: fetchEmails-001.json"
// Instead of: [... 50KB of email data ...]
```

### 4. Retrieval When Needed
```typescript
// If AI needs the data, it calls the readFile tool
const fullData = await readFile({ key: "fetchEmails-001.json" });
// Reads from the session directory automatically
```

## 🚀 Quick Start

```bash
# 1. No setup needed!

# 2. Run example
npm run example:ctx-local

# 3. Check stored data
ls -lh .ctx-storage/*/tool-results/

# 4. Inspect a file
cat .ctx-storage/demo-*/tool-results/fetchEmails-001.json | jq
```

## 📈 Best Practices

### 1. Session Management

```typescript
// Create unique session IDs per conversation
const sessionId = `chat-${userId}-${Date.now()}`;

const storageAdapter = new FileAdapter({
  baseDir: path.resolve(process.cwd(), ".ctx-storage"),
  sessionId
});
```

### 2. Cleanup Old Sessions

```typescript
// Periodically clean up old session directories
import { promises as fs } from 'fs';
import path from 'path';

async function cleanupOldSessions(maxAgeMs: number) {
  const storageDir = '.ctx-storage';
  const sessions = await fs.readdir(storageDir);
  
  for (const session of sessions) {
    const sessionPath = path.join(storageDir, session);
    const stats = await fs.stat(sessionPath);
    
    if (Date.now() - stats.mtimeMs > maxAgeMs) {
      await fs.rm(sessionPath, { recursive: true });
      console.log(`Cleaned up session: ${session}`);
    }
  }
}

// Run daily: clean sessions older than 7 days
cleanupOldSessions(7 * 24 * 60 * 60 * 1000);
```

### 3. Monitor Storage Usage

```typescript
async function getStorageSize() {
  const storageDir = '.ctx-storage';
  const sessions = await fs.readdir(storageDir);
  
  let totalSize = 0;
  for (const session of sessions) {
    const sessionPath = path.join(storageDir, session, 'tool-results');
    const files = await fs.readdir(sessionPath);
    
    for (const file of files) {
      const stats = await fs.stat(path.join(sessionPath, file));
      totalSize += stats.size;
    }
  }
  
  return totalSize;
}
```

### 4. Read Tools Configuration

```typescript
// Ensure read tools can access the storage
const tools = {
  fetchEmails: tool({ /* ... */ }),
  readFile: createReadFileTool({ baseDir: storageAdapter }),
  grepAndSearchFile: createGrepAndSearchFileTool({ baseDir: storageAdapter })
};
```

## 🐛 Troubleshooting

### Issue: "ENOENT: no such file or directory"

**Solution:**
The FileAdapter automatically creates directories, but ensure you have write permissions:
```bash
chmod 755 .ctx-storage
```

### Issue: Cannot read from storage

**Solution:**
Ensure the read tools use the same storage adapter with the same sessionId:
```typescript
// Create once, reuse for all tools
const storageAdapter = new FileAdapter({
  baseDir: path.resolve(process.cwd(), ".ctx-storage"),
  sessionId
});

const tools = {
  readFile: createReadFileTool({ baseDir: storageAdapter }),
  // ... other tools
};
```

### Issue: Files growing too large

**Solution:**
Implement periodic cleanup or use boundary settings to compact selectively:
```typescript
await compactMessages(messages, {
  baseDir: storageAdapter,
  boundary: "last-turn", // Only compact latest turn
  sessionId
});
```

## 📚 Learn More

- **API Documentation:** `../../README.md`
- **Storage Interface:** `../../src/storage/types.ts`
- **Compression Strategy:** `../../src/strategies/writeToolResultsToStorage.ts`

---

**Tip:** Use session-based organization to easily debug conversations and clean up old data!
