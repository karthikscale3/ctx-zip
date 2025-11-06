# Sandbox Providers

The MCP Sandbox Explorer now supports **pluggable sandbox providers**, making it easy to swap between different sandbox implementations.

## Architecture

```
MCPSandboxExplorer
    ↓
SandboxProvider (interface)
    ↓
├── VercelSandboxProvider (built-in)
├── E2BSandboxProvider (built-in)
├── LocalSandboxProvider (built-in)
├── DockerSandboxProvider (you can implement)
└── ... (any custom provider)
```

## Using the Default (Vercel) Provider

The simplest way to use the library - Vercel sandbox is the default:

```typescript
import { MCPSandboxExplorer } from "ctx-zip";

const explorer = await MCPSandboxExplorer.create({
  servers: [
    { name: "grep-app", url: "https://mcp.grep.app" }
  ],
  // Optional: Vercel-specific options
  sandboxOptions: {
    timeout: 1800000,
    runtime: "node22",
    vcpus: 4,
  }
});
```

## Using a Custom Sandbox Provider

You can provide your own sandbox implementation:

```typescript
import { 
  MCPSandboxExplorer, 
  type SandboxProvider 
} from "ctx-zip";

// Use your custom provider
const myProvider: SandboxProvider = await MyCustomProvider.create();

const explorer = await MCPSandboxExplorer.create({
  servers: [
    { name: "grep-app", url: "https://mcp.grep.app" }
  ],
  sandboxProvider: myProvider, // Pass your custom provider
});
```

## Implementing a Custom Sandbox Provider

To create your own sandbox provider, implement the `SandboxProvider` interface:

```typescript
import { 
  type SandboxProvider,
  type CommandResult,
  type SandboxFile,
  type SandboxCommand,
} from "ctx-zip";

export class MyCustomSandboxProvider implements SandboxProvider {
  /**
   * Write multiple files to the sandbox
   */
  async writeFiles(files: SandboxFile[]): Promise<void> {
    // Your implementation
    for (const file of files) {
      // file.path - where to write
      // file.content - Buffer of content
    }
  }

  /**
   * Execute a command in the sandbox
   */
  async runCommand(command: SandboxCommand): Promise<CommandResult> {
    // Your implementation
    const result = await yourSandbox.exec(command.cmd, command.args);
    
    return {
      exitCode: result.exitCode,
      stdout: async () => result.stdout,
      stderr: async () => result.stderr,
    };
  }

  /**
   * Stop/cleanup the sandbox
   */
  async stop(): Promise<void> {
    // Your cleanup logic
  }

  /**
   * Get a unique identifier for this sandbox instance
   */
  getId(): string {
    return "my-sandbox-123";
  }
}
```

## Example: Docker Sandbox Provider

Here's a sketch of how you might implement a Docker-based provider:

```typescript
import { SandboxProvider, CommandResult, SandboxFile, SandboxCommand } from "ctx-zip";
import Docker from "dockerode";

export class DockerSandboxProvider implements SandboxProvider {
  private docker: Docker;
  private container: Docker.Container;

  static async create(options: { image?: string } = {}) {
    const docker = new Docker();
    const container = await docker.createContainer({
      Image: options.image || "node:22-alpine",
      Cmd: ["tail", "-f", "/dev/null"], // Keep running
      WorkingDir: "/workspace",
    });
    
    await container.start();
    return new DockerSandboxProvider(docker, container);
  }

  private constructor(docker: Docker, container: Docker.Container) {
    this.docker = docker;
    this.container = container;
  }

  async writeFiles(files: SandboxFile[]): Promise<void> {
    for (const file of files) {
      // Write file to container
      await this.container.putArchive(/* tar stream of file */, {
        path: file.path
      });
    }
  }

  async runCommand(command: SandboxCommand): Promise<CommandResult> {
    const exec = await this.container.exec({
      Cmd: [command.cmd, ...command.args],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    
    let stdout = "";
    let stderr = "";
    
    stream.on("data", (chunk) => {
      // Parse Docker stream format
      stdout += chunk.toString();
    });

    await new Promise((resolve) => stream.on("end", resolve));

    const { ExitCode } = await exec.inspect();

    return {
      exitCode: ExitCode,
      stdout: async () => stdout,
      stderr: async () => stderr,
    };
  }

  async stop(): Promise<void> {
    await this.container.stop();
    await this.container.remove();
  }

  getId(): string {
    return this.container.id;
  }
}
```

## Workspace Path

Each sandbox provider defines a **workspace path** via `getWorkspacePath()`. This is the root directory where:
- MCP tool definitions are generated (`{workspace}/servers/`)
- User code is executed (`{workspace}/user-code/`)

**Examples:**
- Vercel: `/vercel/sandbox`
- Docker: `/workspace`
- Local: `/tmp/mcp-sandbox`
- Your custom provider: whatever you choose!

This makes the library **completely decoupled** from any specific sandbox implementation.

## Benefits of Pluggable Providers

1. **Flexibility**: Choose the sandbox that fits your needs
2. **Testing**: Mock sandbox for unit tests
3. **Cost**: Use cheaper alternatives to Vercel
4. **Control**: Full control over the execution environment
5. **Multi-platform**: Run on any platform that supports your provider
6. **Path-agnostic**: No hardcoded Vercel-specific paths

## Provider Interface Reference

```typescript
interface SandboxProvider {
  // Write files to sandbox
  writeFiles(files: SandboxFile[]): Promise<void>;
  
  // Execute command
  runCommand(command: SandboxCommand): Promise<CommandResult>;
  
  // Cleanup
  stop(): Promise<void>;
  
  // Get ID
  getId(): string;
  
  // Get workspace path (where tools and user code live)
  getWorkspacePath(): string;
}

interface SandboxFile {
  path: string;
  content: Buffer;
}

interface SandboxCommand {
  cmd: string;
  args: string[];
}

interface CommandResult {
  exitCode: number;
  stdout(): Promise<string>;
  stderr(): Promise<string>;
}
```

## Built-in Providers

The library includes two production-ready sandbox providers:

### 1. E2B Sandbox Provider (Recommended)

**Best for:** Production use, long-running processes, custom packages, TypeScript execution

```typescript
import { E2BSandboxProvider } from "ctx-zip";

const provider = await E2BSandboxProvider.create({
  apiKey: process.env.E2B_API_KEY, // Optional if set in environment
  timeout: 1800000, // 30 minutes default
  template: "base", // Optional: custom E2B template ID
  metadata: { project: "my-app" }, // Optional metadata
  cwd: "/home/user", // Working directory
});

// Helper methods for TypeScript
await provider.runTypeScript("/home/user/script.ts");
await provider.installPackages(["axios", "lodash"]);

// File operations
await provider.readFile("data.json");
await provider.listFiles("/home/user");
await provider.setWorkingDirectory("/home/user/project");

// Access underlying E2B sandbox if needed
const e2bSandbox = provider.getE2BSandbox();
```

**Features:**
- ✅ Cloud-based isolated environments
- ✅ Full Node.js and TypeScript support
- ✅ Direct TypeScript execution with `runTypeScript()`
- ✅ Package installation with `installPackages()`
- ✅ Rich file system API
- ✅ 30-minute default timeout
- ✅ Production-ready and reliable
- ✅ Custom templates support

**Get started:** https://e2b.dev/docs

### 2. Vercel Sandbox Provider

**Best for:** Quick prototyping, Vercel-hosted apps, Vercel ecosystem integration

```typescript
import { VercelSandboxProvider } from "ctx-zip";

const provider = await VercelSandboxProvider.create({
  timeout: 1800000,
  runtime: "node22" | "python3.13",
  vcpus: 4,
});

// Access underlying Vercel sandbox if needed
const vercelSandbox = provider.getVercelSandbox();
```

**Features:**
- ✅ Fast spin-up time
- ✅ Node.js and Python support
- ✅ Vercel ecosystem integration
- ✅ Simple API

### 3. Local Sandbox Provider

**Best for:** Debugging, local development, inspecting generated files, testing without cloud dependencies

```typescript
import { LocalSandboxProvider } from "ctx-zip";

const provider = await LocalSandboxProvider.create({
  sandboxDir: "./.sandbox",     // Where to write files (default: "./.sandbox")
  cleanOnCreate: true,           // Clean directory on start (default: true)
});

// All files are written to local filesystem
console.log(`Files at: ${provider.getAbsolutePath()}`);

// Get absolute path to any file/directory
const userCodePath = provider.getAbsolutePath("user-code");

// Commands run using Node.js child_process
// Real-time stdout/stderr to your console!
const result = await provider.runCommand({
  cmd: "node",
  args: ["script.js"]
});
```

**Features:**
- ✅ **No cloud required** - runs entirely locally
- ✅ **Direct file inspection** - open `.sandbox/` in your file explorer
- ✅ **Real-time output** - see stdout/stderr as it happens
- ✅ **Fast iteration** - no network latency
- ✅ **Perfect for debugging** - inspect generated MCP client code
- ✅ **Zero setup** - uses your local Node.js and npm
- ✅ **Files persist** - inspect after execution completes

**Use cases:**
- 🐛 **Debugging MCP client code** - see exactly what gets generated
- 🧪 **Testing without cloud costs** - free local development
- 📝 **Documentation** - generate examples to commit to repo
- 🔍 **Learning** - understand what the library generates
- ⚡ **Fast feedback** - no cloud sandbox spin-up time

**Examples:**
```bash
npm run example:local-mcp         # Simple MCP search example
npm run example:local-advanced    # Advanced multi-server example
```

After running, check `./.sandbox/` to see all generated files!

## Comparison

| Feature | E2B | Vercel | Local |
|---------|-----|--------|-------|
| TypeScript execution | ✅ Built-in | ⚠️ Manual setup | ✅ Uses local tsx/node |
| Package installation | ✅ Built-in | ⚠️ Manual setup | ✅ Uses local npm |
| File operations | ✅ Rich API | ⚠️ Basic | ✅ Direct filesystem |
| File inspection | ⚠️ Via tools | ⚠️ Via tools | ✅ **Direct access** |
| Real-time output | ⚠️ After completion | ⚠️ After completion | ✅ **Live streaming** |
| Max timeout | 30+ minutes | 30 minutes | ∞ Unlimited |
| Setup required | 🔑 API key | 🔑 API key | ✅ **None** |
| Cost | 💰 Paid tier available | 💰 Paid tier available | 💚 **100% Free** |
| Network required | ☁️ Yes | ☁️ Yes | ✅ **No** |
| Production ready | ✅ Yes | ✅ Yes | ⚠️ Debug/dev only |
| Speed | ⚡ Fast | ⚡ Fast | ⚡⚡ **Instant** |
| Best for | Production, isolation | Vercel apps | **Debugging, learning** |

## Migration from Previous Version

If you were using the old API:

**Before:**
```typescript
const sandbox = explorer.getSandbox(); // Returns Vercel Sandbox
```

**After:**
```typescript
const provider = explorer.getSandboxProvider(); // Returns SandboxProvider interface
```

The provider abstraction ensures your code works with any sandbox implementation! 🎉

