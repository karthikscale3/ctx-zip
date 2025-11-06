// Standalone MCP client for connecting to MCP servers and fetching tool definitions

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServerConfig, ToolDefinition } from "./types.js";

/**
 * Connect to an MCP server and fetch all available tool definitions
 */
export async function fetchToolDefinitions(
  serverConfig: MCPServerConfig
): Promise<ToolDefinition[]> {
  const { url, useSSE = false, headers = {} } = serverConfig;

  const requestInit = Object.keys(headers).length > 0 ? { headers } : undefined;

  const transport = useSSE
    ? new SSEClientTransport(
        new URL(url),
        requestInit ? { requestInit } : undefined
      )
    : new StreamableHTTPClientTransport(new URL(url), { requestInit });

  const client = new Client(
    {
      name: "ctx-zip",
      version: "0.0.7",
    },
    {
      capabilities: {},
    }
  );

  try {
    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Connection timeout after 30 seconds")),
          30000
        )
      ),
    ]);

    const toolsResult = await client.listTools();

    const tools: ToolDefinition[] = toolsResult.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return tools;
  } catch (error) {
    throw new Error(
      `Failed to fetch tools from ${serverConfig.name}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    await client.close();
  }
}
