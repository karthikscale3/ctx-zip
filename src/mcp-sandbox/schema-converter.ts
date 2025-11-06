// Convert JSON Schema to TypeScript interfaces and JSDoc

/**
 * Generate TypeScript interface from JSON Schema
 */
export function generateTypeScriptInterface(
  schema: any,
  interfaceName: string
): string {
  if (!schema || !schema.properties) {
    return `export interface ${interfaceName} {\n  [key: string]: any;\n}`;
  }

  const properties = schema.properties;
  const required = schema.required || [];

  const lines: string[] = [`export interface ${interfaceName} {`];

  for (const [propName, propSchema] of Object.entries(properties)) {
    const isRequired = required.includes(propName);
    const optional = isRequired ? "" : "?";
    const propType = jsonSchemaTypeToTS(propSchema as any);

    // Add JSDoc comment if description exists
    const desc = (propSchema as any).description;
    if (desc) {
      lines.push(`  /** ${desc} */`);
    }

    lines.push(`  ${propName}${optional}: ${propType};`);
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Convert JSON Schema type to TypeScript type
 */
function jsonSchemaTypeToTS(schema: any): string {
  if (schema.enum) {
    return schema.enum.map((v: any) => JSON.stringify(v)).join(" | ");
  }

  if (schema.type === "array") {
    if (schema.items) {
      const itemType = jsonSchemaTypeToTS(schema.items);
      return `${itemType}[]`;
    }
    return "any[]";
  }

  if (schema.type === "object") {
    if (schema.properties) {
      // Inline object type
      const props = Object.entries(schema.properties)
        .map(([key, val]) => {
          const required = schema.required || [];
          const optional = required.includes(key) ? "" : "?";
          return `${key}${optional}: ${jsonSchemaTypeToTS(val)}`;
        })
        .join("; ");
      return `{ ${props} }`;
    }
    return "Record<string, any>";
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    default:
      return "any";
  }
}

/**
 * Extract JSDoc comment from schema description
 */
export function extractJSDocFromSchema(
  schema: any,
  toolName: string,
  toolDescription?: string,
  serverName?: string
): string {
  const lines: string[] = ["/**"];

  // Use tool description if provided, otherwise schema description
  const description = toolDescription || schema.description || toolName;
  lines.push(` * ${description}`);

  if (schema.properties) {
    lines.push(" *");
    lines.push(" * @param input - The input parameters");
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const desc = (propSchema as any).description || propName;
      const required = schema.required?.includes(propName)
        ? "(required)"
        : "(optional)";
      lines.push(` * @param input.${propName} - ${desc} ${required}`);
    }
  }

  lines.push(" *");
  lines.push(` * @returns Promise with the result of ${toolName}`);

  // Add response format documentation
  lines.push(" *");
  lines.push(
    " * @note Response format: The MCP tool returns an object, not an array."
  );
  lines.push(
    " *       For text responses, access the data via the returned object/string."
  );
  lines.push(
    " *       Example: const result = await tool(...); // result is an object or string"
  );
  lines.push(
    " *       Always log the response first to understand its structure!"
  );

  lines.push(" */");

  return lines.join("\n");
}
