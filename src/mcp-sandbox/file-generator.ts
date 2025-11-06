// Generate TypeScript files in the sandbox

import type { SandboxProvider } from "./sandbox-provider.js";
import {
  extractJSDocFromSchema,
  generateTypeScriptInterface,
} from "./schema-converter.js";
import type {
  MCPServerConfig,
  ServerToolsMap,
  ToolDefinition,
} from "./types.js";

/**
 * Sanitize tool name to be a valid TypeScript identifier
 */
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Generate a realistic usage example from the schema
 */
function generateUsageExample(functionName: string, schema: any): string {
  if (!schema || !schema.properties) {
    return `const result = await ${functionName}({});`;
  }

  const exampleArgs: Record<string, any> = {};
  const required = schema.required || [];

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const prop = propSchema as any;

    // Only include required fields or first few fields
    if (!required.includes(propName) && Object.keys(exampleArgs).length >= 2) {
      continue;
    }

    // Generate example values based on type and description
    if (prop.type === "string") {
      if (
        prop.description?.toLowerCase().includes("query") ||
        prop.description?.toLowerCase().includes("search")
      ) {
        exampleArgs[propName] = "your search query";
      } else if (prop.description?.toLowerCase().includes("repo")) {
        exampleArgs[propName] = "owner/repository";
      } else if (prop.description?.toLowerCase().includes("url")) {
        exampleArgs[propName] = "https://example.com";
      } else {
        exampleArgs[propName] = `example ${propName}`;
      }
    } else if (prop.type === "number" || prop.type === "integer") {
      exampleArgs[propName] = 10;
    } else if (prop.type === "boolean") {
      exampleArgs[propName] = true;
    } else if (prop.type === "array") {
      if (prop.description?.toLowerCase().includes("language")) {
        exampleArgs[propName] = ["TypeScript", "JavaScript"];
      } else {
        exampleArgs[propName] = ["item1", "item2"];
      }
    }
  }

  return `// Always log the response to understand its structure
const result = await ${functionName}(${JSON.stringify(exampleArgs, null, 2)});
console.log('Response:', JSON.stringify(result, null, 2));

// Then process based on actual structure
// Note: result is typically an object, not an array!`;
}

/**
 * Generate a single tool file
 */
export function generateToolFile(
  tool: ToolDefinition,
  serverName: string
): string {
  const functionName = sanitizeToolName(tool.name);
  const inputInterfaceName = `${functionName
    .charAt(0)
    .toUpperCase()}${functionName.slice(1)}Input`;
  const outputInterfaceName = `${functionName
    .charAt(0)
    .toUpperCase()}${functionName.slice(1)}Output`;

  const jsdoc = extractJSDocFromSchema(
    tool.inputSchema,
    functionName,
    tool.description
  );
  const inputInterface = generateTypeScriptInterface(
    tool.inputSchema,
    inputInterfaceName
  );

  // Generate usage example (simpler to avoid nested template issues)
  const exampleUsage = generateUsageExample(functionName, tool.inputSchema);

  return `import { callMCPTool } from '../_client.ts';

${jsdoc}
${inputInterface}

export interface ${outputInterfaceName} {
  [key: string]: any;
}

/**
 * @example
 * ${exampleUsage}
 */
export async function ${functionName}(
  input: ${inputInterfaceName}
): Promise<${outputInterfaceName}> {
  return callMCPTool<${outputInterfaceName}>('${serverName}', '${tool.name}', input);
}
`;
}

/**
 * Generate server index file that exports all tools
 */
export function generateServerIndex(
  tools: ToolDefinition[],
  serverName: string
): string {
  const exports = tools
    .map((tool) => {
      const functionName = sanitizeToolName(tool.name);
      return `export { ${functionName} } from './${functionName}.ts';`;
    })
    .join("\n");

  return `// Auto-generated index for ${serverName} MCP server tools

${exports}
`;
}

/**
 * Generate the MCP client router that connects to all servers
 */
export function generateMCPClient(servers: MCPServerConfig[]): string {
  const serverConfigsObj = servers.reduce((acc, server) => {
    acc[server.name] = {
      url: server.url,
      useSSE: server.useSSE || false,
      headers: server.headers || {},
    };
    return acc;
  }, {} as Record<string, any>);

  return `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

console.log('[MCP Client] Module loaded, initializing...');

const serverConfigs = ${JSON.stringify(serverConfigsObj, null, 2)};

console.log('[MCP Client] Server configs loaded:', Object.keys(serverConfigs).join(', '));

const clients = new Map<string, Client>();

console.log('[MCP Client] Ready to accept requests');

async function getClient(serverName: string): Promise<Client> {
  console.log(\`[MCP Client] getClient called for: \${serverName}\`);
  
  if (clients.has(serverName)) {
    console.log(\`[MCP Client] Using cached client for: \${serverName}\`);
    return clients.get(serverName)!;
  }
  
  console.log(\`[MCP Client] Creating new client for: \${serverName}\`);
  const config = serverConfigs[serverName as keyof typeof serverConfigs];
  if (!config) {
    console.error(\`[MCP Client] Unknown server: \${serverName}\`);
    console.error(\`[MCP Client] Available servers: \${Object.keys(serverConfigs).join(', ')}\`);
    throw new Error(\`Unknown MCP server: \${serverName}\`);
  }

  console.log(\`[MCP Client] Server config:\`, JSON.stringify(config, null, 2));

  const requestInit = Object.keys(config.headers).length > 0 
    ? { headers: config.headers } 
    : undefined;

  console.log(\`[MCP Client] Using transport: \${config.useSSE ? 'SSE' : 'StreamableHTTP'}\`);
  console.log(\`[MCP Client] Target URL: \${config.url}\`);
  console.log(\`[MCP Client] Headers present: \${Object.keys(config.headers).length > 0 ? 'yes' : 'no'}\`);

  const transport = config.useSSE
    ? new SSEClientTransport(new URL(config.url), requestInit ? { requestInit } : undefined)
    : new StreamableHTTPClientTransport(new URL(config.url), { requestInit });

  console.log(\`[MCP Client] Transport created, initializing client...\`);

  const client = new Client(
    { name: 'sandbox-mcp', version: '1.0.0' },
    { capabilities: {} }
  );

  console.log(\`[MCP Client] Connecting to \${serverName}...\`);
  const connectStart = Date.now();
  
  try {
    await client.connect(transport);
    const connectTime = Date.now() - connectStart;
    console.log(\`[MCP Client] ✓ Connected to \${serverName} in \${connectTime}ms\`);
    clients.set(serverName, client);
    return client;
  } catch (error) {
    const connectTime = Date.now() - connectStart;
    console.error(\`[MCP Client] ✗ Connection failed to \${serverName} after \${connectTime}ms\`);
    console.error(\`[MCP Client] Error type: \${error instanceof Error ? error.constructor.name : typeof error}\`);
    console.error(\`[MCP Client] Error message: \${error instanceof Error ? error.message : String(error)}\`);
    if (error instanceof Error && error.stack) {
      console.error(\`[MCP Client] Stack trace:\`, error.stack.split('\\n').slice(0, 5).join('\\n'));
    }
    throw error;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(\`\${operation} timeout after \${timeoutMs}ms\`)), timeoutMs)
    )
  ]);
}

export async function callMCPTool<T>(
  serverName: string,
  toolName: string,
  args: any
): Promise<T> {
  console.log(\`\\n[MCP Tool Call] ========================================\`);
  console.log(\`[MCP Tool Call] Server: \${serverName}\`);
  console.log(\`[MCP Tool Call] Tool: \${toolName}\`);
  console.log(\`[MCP Tool Call] Args:\`, JSON.stringify(args, null, 2));
  
  try {
    console.log(\`[MCP Tool Call] Getting client for \${serverName}...\`);
    const clientStart = Date.now();
    const client = await withTimeout(
      getClient(serverName),
      10000,
      'MCP client connection'
    );
    const clientTime = Date.now() - clientStart;
    console.log(\`[MCP Tool Call] ✓ Got client in \${clientTime}ms\`);
    
    console.log(\`[MCP Tool Call] Calling tool '\${toolName}'...\`);
    const toolStart = Date.now();
    const result = await withTimeout(
      client.callTool({ name: toolName, arguments: args }),
      20000,
      \`MCP tool call '\${toolName}'\`
    );
    const toolTime = Date.now() - toolStart;
    console.log(\`[MCP Tool Call] ✓ Tool call completed in \${toolTime}ms\`);
    console.log(\`[MCP Tool Call] Raw result type: \${typeof result}\`);
    console.log(\`[MCP Tool Call] Raw result keys: \${Object.keys(result || {}).join(', ')}\`);
    
    // Parse MCP response
    if (Array.isArray(result.content)) {
      console.log(\`[MCP Tool Call] Content is array with \${result.content.length} items\`);
      const text = result.content
        .map(item => typeof item === 'string' ? item : JSON.stringify(item))
        .join('\\n');
      console.log(\`[MCP Tool Call] Combined text length: \${text.length}\`);
      try {
        const parsed = JSON.parse(text) as T;
        console.log(\`[MCP Tool Call] ✓ Successfully parsed as JSON\`);
        return parsed;
      } catch {
        console.log(\`[MCP Tool Call] Returning as text (not valid JSON)\`);
        return text as T;
      }
    }
    
    if (typeof result.content === 'string') {
      console.log(\`[MCP Tool Call] Content is string with length: \${result.content.length}\`);
      try {
        const parsed = JSON.parse(result.content) as T;
        console.log(\`[MCP Tool Call] ✓ Successfully parsed as JSON\`);
        return parsed;
      } catch {
        console.log(\`[MCP Tool Call] Returning as text (not valid JSON)\`);
        return result.content as T;
      }
    }
    
    console.log(\`[MCP Tool Call] Returning content as-is\`);
    return result.content as T;
  } catch (error) {
    console.error(\`\\n[MCP Client Error] ========================================\`);
    console.error(\`[MCP Client Error] Server: \${serverName}, Tool: \${toolName}\`);
    console.error(\`[MCP Client Error] Error type: \${error instanceof Error ? error.constructor.name : typeof error}\`);
    console.error(\`[MCP Client Error] Error message: \${error instanceof Error ? error.message : String(error)}\`);
    if (error instanceof Error && error.stack) {
      console.error(\`[MCP Client Error] Stack trace:\`, error.stack.split('\\n').slice(0, 5).join('\\n'));
    }
    console.error(\`[MCP Client Error] ========================================\\n\`);
    throw error;
  }
}

// Cleanup function to close all MCP client connections
export async function closeAllConnections(): Promise<void> {
  console.log('[MCP Client] Closing all connections...');
  for (const [serverName, client] of clients.entries()) {
    try {
      await client.close();
      console.log(\`[MCP Client] ✓ Closed connection to \${serverName}\`);
    } catch (err) {
      console.error(\`[MCP Client] Error closing \${serverName}:\`, err);
    }
  }
  clients.clear();
  console.log('[MCP Client] All connections closed');
}

// Auto-cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    closeAllConnections().catch(console.error);
  });
  
  // Force cleanup after 15 seconds of inactivity (enough time for slow API calls)
  let lastActivityTime = Date.now();
  let cleanupTimer: NodeJS.Timeout | null = null;
  
  const resetCleanupTimer = () => {
    lastActivityTime = Date.now();
    if (cleanupTimer) clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(async () => {
      const idleTime = Date.now() - lastActivityTime;
      if (idleTime >= 15000) {
        console.log('[MCP Client] Auto-cleanup: No activity for 15s, closing connections...');
        await closeAllConnections();
        process.exit(0);
      }
    }, 16000);
  };
  
  // Monitor console output to detect when script is done
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: any[]) => {
    resetCleanupTimer();
    originalLog(...args);
  };
  console.error = (...args: any[]) => {
    resetCleanupTimer();
    originalError(...args);
  };
  
  // Start the timer
  resetCleanupTimer();
}
`;
}

/**
 * Generate README with usage instructions
 */
function generateREADME(
  serverToolsMap: ServerToolsMap,
  servers: MCPServerConfig[]
): string {
  const totalTools = Object.values(serverToolsMap).reduce(
    (sum, tools) => sum + tools.length,
    0
  );

  let readme = `# MCP Tool Definitions

This directory contains TypeScript definitions for ${totalTools} MCP tool(s) from ${servers.length} server(s).

## 🗂️ Structure

\`\`\`
.
├── _client.ts           # MCP client for calling tools
├── README.md            # This file
`;

  // Add server directories
  for (const [serverName, tools] of Object.entries(serverToolsMap)) {
    readme += `└── ${serverName}/\n`;
    readme += `    ├── index.ts         # Exports all tools\n`;
    tools.forEach((tool) => {
      const fileName = sanitizeToolName(tool.name);
      readme += `    └── ${fileName}.ts\n`;
    });
  }

  readme += `\`\`\`

## 🚀 Quick Start

All tools can be imported from their server directory:

\`\`\`typescript
// Import from server directory
`;

  // Show first tool from each server as example
  for (const [serverName, tools] of Object.entries(serverToolsMap)) {
    if (tools.length > 0) {
      const firstTool = sanitizeToolName(tools[0].name);
      readme += `import { ${firstTool} } from './${serverName}/index.ts';\n`;
    }
  }

  readme += `

// Use the tools
`;

  // Show usage example for first tool
  for (const [serverName, tools] of Object.entries(serverToolsMap)) {
    if (tools.length > 0) {
      const tool = tools[0];
      const functionName = sanitizeToolName(tool.name);
      const example = generateUsageExample(functionName, tool.inputSchema);
      readme += `${example}\n`;
      break; // Just show one example
    }
  }

  readme += `\`\`\`

## 📚 Available Tools

`;

  // List all tools by server
  for (const [serverName, tools] of Object.entries(serverToolsMap)) {
    readme += `### ${serverName}\n\n`;
    tools.forEach((tool) => {
      const functionName = sanitizeToolName(tool.name);
      readme += `- **${functionName}**: ${
        tool.description || "No description"
      }\n`;
    });
    readme += `\n`;
  }

  readme += `## 💡 Tips for Using These Tools

1. **Check the type definitions**: Each tool file contains TypeScript interfaces with full JSDoc
2. **Look at examples**: Each function has an @example in its JSDoc
3. **Import from index**: Use \`import { toolName } from './server-name/index.ts'\`
4. **Relative imports**: When writing scripts in ../user-code/, use \`'../servers/...'\`
5. **⚠️ IMPORTANT - Response Handling**: 
   - **Always log the response first** to understand its structure!
   - MCP tools return **objects or strings, NOT arrays**
   - Use \`console.log('Response:', JSON.stringify(result, null, 2));\` before processing
   - Don't assume array methods like \`.map()\` or \`.length\` will work
   - Parse the actual response structure (often \`{ type: "text", text: "..." }\` or plain strings)
6. **🔄 CRITICAL - Clean Exit**: 
   - **Always call \`closeAllConnections()\` before exiting** to close MCP connections
   - Import from \`_client.ts\`: \`import { closeAllConnections } from './servers/_client.ts';\`
   - Call in \`finally\` block: \`finally { await closeAllConnections(); }\`
   - **Without this, your script may hang for 60+ seconds!**

## 📖 Recommended Script Pattern

\`\`\`typescript
import { toolName } from './servers/server-name/index.ts';
import { closeAllConnections } from './servers/_client.ts';

async function main() {
  try {
    // Your MCP tool calls here
    const result = await toolName({ /* args */ });
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Critical: Close connections for immediate exit
    await closeAllConnections();
  }
}

main().catch(console.error);
\`\`\`

## 🔧 Implementation Details

All tools use the \`callMCPTool\` function from \`_client.ts\` which handles:
- MCP server connections (via HTTP or SSE)
- Request/response serialization
- Error handling and timeouts
- Type safety
- Connection pooling and reuse

The \`closeAllConnections()\` function ensures all MCP clients are properly closed, preventing the Node.js event loop from keeping the process alive.

See individual tool files for detailed parameter descriptions and usage examples.
`;

  return readme;
}

/**
 * Write all files to the sandbox
 */
export async function writeFilesToSandbox(
  sandboxProvider: SandboxProvider,
  serverToolsMap: ServerToolsMap,
  servers: MCPServerConfig[],
  outputDir: string
): Promise<void> {
  const filesToWrite: { path: string; content: Buffer }[] = [];

  // Generate README
  const readmeCode = generateREADME(serverToolsMap, servers);
  filesToWrite.push({
    path: `${outputDir}/README.md`,
    content: Buffer.from(readmeCode, "utf-8"),
  });

  // Generate _client.ts
  const clientCode = generateMCPClient(servers);
  filesToWrite.push({
    path: `${outputDir}/_client.ts`,
    content: Buffer.from(clientCode, "utf-8"),
  });

  // Generate tool files for each server
  for (const [serverName, tools] of Object.entries(serverToolsMap)) {
    const serverDir = `${outputDir}/${serverName}`;

    // Individual tool files
    for (const tool of tools) {
      const toolFileName = sanitizeToolName(tool.name);
      const toolCode = generateToolFile(tool, serverName);
      filesToWrite.push({
        path: `${serverDir}/${toolFileName}.ts`,
        content: Buffer.from(toolCode, "utf-8"),
      });
    }

    // Server index file
    const indexCode = generateServerIndex(tools, serverName);
    filesToWrite.push({
      path: `${serverDir}/index.ts`,
      content: Buffer.from(indexCode, "utf-8"),
    });
  }

  // Write all files at once
  await sandboxProvider.writeFiles(filesToWrite);
}
