# Context Management Examples

These examples demonstrate **context compression** - efficiently storing and retrieving AI tool call results to reduce token usage and costs.

## 🎯 What is Context Compression?

When AI agents make tool calls, the results can be very large (e.g., database queries, API responses). Instead of passing full results to the AI model (consuming tokens), we:

1. **Compress** tool results into compact format
2. **Store** compressed data in persistent storage
3. **Generate** compact references for the AI
4. **Retrieve** full data only when needed

**Result:** Reduce token usage by 50-90% while maintaining full functionality.

## 📁 Examples

### `local_file.ts` - Local File Storage

**Purpose:** Store compressed tool results in local files.

```bash
npm run example:ctx-local
```

**What it does:**
```typescript
import { FileStorageResolver } from "ctx-zip";

// Create resolver
const resolver = new FileStorageResolver("./ctx-data");

// Compress and store
const result = await generateText({
  model: openai("gpt-4o-mini"),
  tools: {
    get_users: tool({
      // ... returns large list of users ...
    })
  },
  experimental_writeToolCallsToStorage: resolver.getStrategy()
});
```

**Benefits:**
- ✅ Simple setup
- ✅ Fast access
- ✅ No external dependencies
- ✅ Good for development

**Use cases:**
- Development and testing
- Single-machine workflows
- Quick prototypes

---

### `vercel_blob.ts` - Vercel Blob Storage

**Purpose:** Store compressed tool results in Vercel Blob Storage.

```bash
npm run example:ctx-blob
```

**What it does:**
```typescript
import { VercelBlobStorageResolver } from "ctx-zip";

// Create resolver with token
const resolver = new VercelBlobStorageResolver({
  token: process.env.BLOB_READ_WRITE_TOKEN!
});

// Compress and store (same API!)
const result = await generateText({
  model: openai("gpt-4o-mini"),
  tools: { /* ... */ },
  experimental_writeToolCallsToStorage: resolver.getStrategy()
});
```

**Benefits:**
- ✅ Cloud-based (distributed access)
- ✅ HTTP URLs for sharing
- ✅ Vercel ecosystem integration
- ✅ Automatic CDN distribution

**Use cases:**
- Production applications
- Distributed systems
- Serverless functions
- Multi-region deployments

**Requirements:**
```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_...
```

Get token: https://vercel.com/docs/storage/vercel-blob

---

## 🆚 Storage Comparison

| Feature | Local File | Vercel Blob |
|---------|------------|-------------|
| **Setup** | None | Token required |
| **Speed** | Very fast | Fast |
| **Cost** | Free | Free tier + paid |
| **Sharing** | No | Yes (HTTP URLs) |
| **Persistence** | Local disk | Cloud storage |
| **Best For** | Development | Production |

## 📊 Token Savings Example

### Without Context Compression

```typescript
// Tool returns 50KB of user data
const result = await generateText({
  model: openai("gpt-4o-mini"),
  tools: { get_users }
});

// AI model receives full 50KB (~12,500 tokens)
// Cost: ~$0.0015 per call
```

### With Context Compression

```typescript
// Tool returns 50KB, but compressed to 5KB
const result = await generateText({
  model: openai("gpt-4o-mini"),
  tools: { get_users },
  experimental_writeToolCallsToStorage: resolver.getStrategy()
});

// AI model receives compact reference (~50 tokens)
// Cost: ~$0.00006 per call
// Savings: ~95% reduction in tokens!
```

## 🔧 How It Works

### 1. Tool Execution
```typescript
const users = await get_users(); // Returns large dataset
```

### 2. Compression & Storage
```typescript
// Automatically compresses and stores
const compressed = compress(users);
const url = await storage.save(compressed);
```

### 3. AI Receives Reference
```typescript
// AI sees: "Data stored at: file://ctx-data/abc123"
// Instead of: [... 50KB of user data ...]
```

### 4. Retrieval When Needed
```typescript
// If AI needs the data, it can retrieve via the reference
const fullData = await storage.retrieve(url);
```

## 🚀 Quick Start

### Option 1: Local File Storage (Easiest)

```bash
# 1. No setup needed!

# 2. Run example
npm run example:ctx-local

# 3. Check stored data
ls -lh ./ctx-data/
```

### Option 2: Vercel Blob Storage (Production)

```bash
# 1. Get Vercel Blob token
# Visit: https://vercel.com/dashboard/stores

# 2. Add to .env
echo "BLOB_READ_WRITE_TOKEN=vercel_blob_..." > ../../.env

# 3. Run example
npm run example:ctx-blob
```

## 📈 Best Practices

### 1. Choose the Right Storage

**Use Local File when:**
- Developing/testing locally
- Single-machine deployment
- No need for sharing across systems

**Use Vercel Blob when:**
- Production deployment
- Serverless functions
- Multi-region or distributed systems
- Need to share results via URLs

### 2. Set Appropriate Retention

```typescript
// Short-lived data (e.g., API responses)
const resolver = new FileStorageResolver("./ctx-data", {
  maxAge: 3600 // 1 hour
});

// Long-lived data (e.g., user reports)
const resolver = new FileStorageResolver("./ctx-data", {
  maxAge: 86400 * 30 // 30 days
});
```

### 3. Monitor Storage Usage

```typescript
// Check storage size periodically
import { promises as fs } from 'fs';

const getStorageSize = async () => {
  const files = await fs.readdir('./ctx-data');
  const sizes = await Promise.all(
    files.map(f => fs.stat(`./ctx-data/${f}`))
  );
  return sizes.reduce((acc, s) => acc + s.size, 0);
};
```

## 🐛 Troubleshooting

### Local File Storage

**Issue:** "ENOENT: no such file or directory"

**Solution:**
```typescript
import { mkdir } from 'fs/promises';
await mkdir('./ctx-data', { recursive: true });
```

### Vercel Blob Storage

**Issue:** "Unauthorized"

**Solution:**
- Check token validity: https://vercel.com/dashboard/stores
- Ensure token has read+write permissions
- Verify token is correctly loaded from `.env`

**Issue:** "Request rate limit exceeded"

**Solution:**
- Vercel Blob has rate limits on free tier
- Consider upgrading plan or throttling requests
- Use local file storage for development

## 📚 Learn More

- **API Documentation:** `../../README.md`
- **Storage Interface:** `../../src/storage/types.ts`
- **Compression Strategy:** `../../src/strategies/writeToolResultsToStorage.ts`

---

**Tip:** Use `local_file.ts` during development for instant feedback, then switch to `vercel_blob.ts` for production deployment!

