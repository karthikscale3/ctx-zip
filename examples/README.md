# Examples

This directory contains examples organized into two main categories:

## 📁 Directory Structure

```
examples/
├── mcp/                    # MCP Sandbox Explorer examples
│   ├── e2b_mcp_search.ts
│   ├── local_mcp_search.ts
│   ├── vercel_mcp_search.ts
│   └── test_sandbox_direct.ts
├── ctx-management/         # Context compression examples
│   ├── local_file.ts
│   ├── vercel_blob.ts
│   └── mock_emails.json
└── README.md
```

---

## 🤖 MCP Sandbox Examples

These examples demonstrate the **MCP Sandbox Explorer** - a system for AI agents to interact with external APIs (MCP servers) by writing and executing code in sandboxes.

### `mcp/e2b_mcp_search.ts` - E2B Cloud Sandbox

**Purpose:** Search GitHub using E2B cloud sandbox.

**What it does:**
- Creates E2B cloud sandbox for isolated execution
- Connects to grep.app MCP server
- AI agent writes TypeScript code to search GitHub
- Executes code in E2B sandbox

**Run:**
```bash
npm run example:mcp-e2b
```

**Requirements:**
```bash
E2B_API_KEY=e2b_your-key-here
```

**Get E2B API key:** https://e2b.dev/docs

---

### `mcp/local_mcp_search.ts` - Local Sandbox (Debugging)

**Purpose:** Search GitHub using local filesystem sandbox.

**What it does:**
- Uses LocalSandboxProvider (writes to `./.sandbox/` directory)
- Connects to grep.app MCP server
- AI agent writes TypeScript code to search GitHub
- Executes code locally with real-time output

**Run:**
```bash
npm run example:mcp-local
```

**Requirements:**
```bash
E2B_API_KEY=your-e2b-api-key
AI_GATEWAY_API_KEY=your-gateway-api-key
VERCEL_OIDC_TOKEN=your-vercel-oidc-token
```

**Benefits:**
- ✅ Inspect all generated files in `./.sandbox/`
- ✅ Real-time console output
- ✅ No cloud provider needed
- ✅ Perfect for debugging

---

### `mcp/vercel_mcp_search.ts` - Vercel Sandbox

**Purpose:** Search GitHub using Vercel sandbox.

**What it does:**
- Uses Vercel Sandbox as the execution environment
- Connects to grep.app MCP server
- AI agent writes TypeScript code to search GitHub
- Executes code in Vercel sandbox

**Run:**
```bash
npm run example:mcp-vercel
```

**Requirements:**
```bash
AI_GATEWAY_API_KEY=your-gateway-api-key
VERCEL_OIDC_TOKEN=your-vercel-oidc-token
```

---

### `mcp/test_sandbox_direct.ts` - Direct Sandbox Testing

**Purpose:** Test sandbox providers directly without AI agent.

**Run:**
```bash
npm run test:sandbox
```

---

## 📦 Context Management Examples

These examples demonstrate **context compression** - storing and retrieving tool call results efficiently.

### `ctx-management/local_file.ts` - Local File Storage

**Purpose:** Store tool results in local files.

**What it does:**
- Compresses tool call results
- Saves to local filesystem
- Retrieves and decompresses when needed
- Uses `FileStorageResolver`

**Run:**
```bash
npm run example:ctx-local
```

**Use case:** Development, testing, single-machine workflows

---

### `ctx-management/vercel_blob.ts` - Vercel Blob Storage

**Purpose:** Store tool results in Vercel Blob Storage.

**What it does:**
- Compresses tool call results
- Uploads to Vercel Blob Storage
- Retrieves via HTTP URLs
- Uses `VercelBlobStorageResolver`

**Run:**
```bash
npm run example:ctx-blob
```

**Requirements:**
```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_...
```

**Get Vercel Blob token:** https://vercel.com/docs/storage/vercel-blob

**Use case:** Production, distributed systems, serverless

---

## 🆚 Which Example Should I Use?

### For MCP Sandbox Explorer:

| Sandbox | Best For | Speed | Cost | Debugging |
|---------|----------|-------|------|-----------|
| **Local** | Development, debugging | Fast | Free | Excellent |
| **E2B** | Production, reliability | Medium | Paid | Good |
| **Vercel** | Vercel ecosystem | Fast | Free tier | Good |

**Start with:** `npm run example:mcp-local` for easiest debugging

### For Context Management:

| Storage | Best For | Speed | Sharing |
|---------|----------|-------|---------|
| **Local File** | Development, single machine | Fast | No |
| **Vercel Blob** | Production, distributed | Medium | Yes (via URLs) |

**Start with:** `npm run example:ctx-local` for simplicity

---

## 🚀 Quick Start

**New to ctx-zip?** Start with the simplest example:

```bash
# 1. Install dependencies
npm install

# 2. Set up .env file
cat > .env << EOF
E2B_API_KEY=your-e2b-api-key
AI_GATEWAY_API_KEY=your-gateway-api-key
VERCEL_OIDC_TOKEN=your-vercel-oidc-token
EOF

# 3. Run local MCP example (no cloud provider needed!)
npm run example:mcp-local
```

Watch the AI agent:
1. Read MCP tool documentation
2. Write TypeScript code to search GitHub
3. Execute the code locally
4. Display search results

All generated files are in `./.sandbox/` for inspection!

---

## 🔧 Sandbox Provider Comparison

### E2B Sandbox (`E2BSandboxProvider`)

**Features:**
- Cloud-based isolated environments
- Full Node.js and TypeScript support
- 30-minute default timeout
- Rich file system API

**Example:**
```typescript
import { E2BSandboxProvider } from "ctx-zip";

const sandbox = await E2BSandboxProvider.create({
  apiKey: process.env.E2B_API_KEY,
  timeout: 600000, // 10 minutes
});
```

### Vercel Sandbox (`VercelSandboxProvider`)

**Features:**
- Fast execution
- Vercel ecosystem integration
- Multiple runtime support (Node.js, Python)

**Example:**
```typescript
import { VercelSandboxProvider } from "ctx-zip";

const sandbox = await VercelSandboxProvider.create({
  runtime: "node22",
  vcpus: 4,
});
```

### Local Sandbox (`LocalSandboxProvider`)

**Features:**
- No cloud provider needed
- Real-time file inspection
- Perfect for debugging
- Fast iteration

**Example:**
```typescript
import { LocalSandboxProvider } from "ctx-zip";

const sandbox = await LocalSandboxProvider.create({
  sandboxDir: "./.sandbox",
  cleanOnCreate: true,
});
```

---

## 🎯 Expected Results

### MCP Search Examples

**Total Steps:** 3-5  
**Tools Used:** `sandbox_cat` (2x), `sandbox_exec` (1x)  
**Time:** ~20-30 seconds  
**Output:** GitHub search results with repository names, file paths, and code snippets

### Context Management Examples

**Total Steps:** N/A (direct demonstration)  
**Time:** ~1-2 seconds  
**Output:** Compressed data stored and retrieved successfully

---

## 🐛 Troubleshooting

### MCP Examples

**Issue:** "No search results"

**Solution:**
1. Check generated files in `./.sandbox/` (for local) or console logs
2. Verify API keys are set correctly
3. Ensure grep.app MCP server is accessible

**Issue:** "Sandbox timeout"

**Solution:**
- Increase timeout in sandbox provider options
- Check network connectivity for E2B/Vercel
- Use local sandbox for debugging

### Context Management Examples

**Issue:** "Cannot write to file"

**Solution:**
- Check file permissions
- Verify directory exists
- For Vercel Blob: check token validity

---

Happy exploring! 🚀
