# MCP Sandbox Examples

These examples demonstrate the **MCP Sandbox Explorer** - a framework for AI agents to interact with external APIs (MCP servers) by writing and executing TypeScript code in sandboxes.

## 🎯 What is MCP Sandbox Explorer?

MCP Sandbox Explorer allows AI agents to:
1. **Discover** available MCP tools by reading generated TypeScript definitions
2. **Write** TypeScript code that uses those tools
3. **Execute** the code in isolated sandboxes
4. **Iterate** on errors until the task is complete

## 📁 Examples

### `e2b_mcp_search.ts` - E2B Cloud Sandbox
- **Provider:** E2B (cloud-based)
- **Command:** `npm run example:mcp-e2b`
- **Best for:** Production use cases

### `local_mcp_search.ts` - Local Sandbox
- **Provider:** LocalSandboxProvider (filesystem-based)
- **Command:** `npm run example:mcp-local`
- **Best for:** Development and debugging

### `vercel_mcp_search.ts` - Vercel Sandbox
- **Provider:** Vercel Sandbox
- **Command:** `npm run example:mcp-vercel`
- **Best for:** Vercel ecosystem integration

### `test_sandbox_direct.ts` - Direct Testing
- **Purpose:** Test sandbox providers without AI agent
- **Command:** `npm run test:sandbox`

## 🚀 Quick Start

The easiest way to get started:

```bash
# 1. Set up environment
cat > ../../.env << EOF
E2B_API_KEY=your-e2b-api-key
AI_GATEWAY_API_KEY=your-gateway-api-key
VERCEL_OIDC_TOKEN=your-vercel-oidc-token
EOF

# 2. Run local example (no cloud provider needed!)
npm run example:mcp-local
```

## 🔧 How It Works

1. **Sandbox Creation**
   ```typescript
   const sandbox = await LocalSandboxProvider.create();
   ```

2. **MCP Explorer Setup**
   ```typescript
   const explorer = await MCPSandboxExplorer.create({
     sandboxProvider: sandbox,
     servers: [
       { name: "grep-app", url: "https://mcp.grep.app" }
     ]
   });
   ```

3. **AI Agent Execution**
   ```typescript
   const result = await generateText({
     model: openai("gpt-4o-mini"),
     tools: explorer.getTools(),
     prompt: "Search GitHub for 'langtrace' in TypeScript files"
   });
   ```

## 📊 Provider Comparison

| Feature | Local | E2B | Vercel |
|---------|-------|-----|--------|
| **Setup** | None | API key | None |
| **Cost** | Free | Paid | Free tier |
| **Speed** | Fast | Medium | Fast |
| **Debugging** | Excellent | Good | Good |
| **File Inspection** | Direct | Via API | Via API |
| **Best For** | Development | Production | Vercel apps |

## 🔍 What You'll See

When running an MCP example:

```
🚀 Starting MCP Sandbox Example

📁 Sandbox: ./.sandbox (local) or [cloud ID]

🔧 Connected to MCP servers:
   ✓ grep-app (GitHub search)

🤖 AI Agent starting...

[sandbox_cat] servers/README.md
[sandbox_cat] servers/grep-app/searchGitHub.ts
[sandbox_exec] script.ts (850 chars)
[sandbox_exec] Completed in 2341ms (exit code: 0)

✅ Results:
   Found 10 repositories matching 'langtrace'
   - Scale3-Labs/langtrace
   - BerriAI/litellm
   ...
```

## 📚 Learn More

- **Architecture:** `../../SANDBOX_PROVIDERS.md`
- **Authentication:** `../../AUTHENTICATION.md`
- **Optimization:** `../../TRAJECTORY_OPTIMIZATION.md`

---

**Tip:** Start with `local_mcp_search.ts` - you can inspect all generated files in `./.sandbox/` directory!

