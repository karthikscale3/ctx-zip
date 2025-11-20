// Generate source files for regular AI SDK tools (non-MCP) inside the sandbox

import type { Tool } from "ai";
import type { SandboxProvider } from "./sandbox-provider.js";
import { generateTypeScriptInterface } from "./schema-converter.js";

type JsonSchema = Record<string, any>;

const zodTypeFallbackMap: Record<string, string> = {
  object: "ZodObject",
  string: "ZodString",
  number: "ZodNumber",
  boolean: "ZodBoolean",
  bigint: "ZodBigInt",
  array: "ZodArray",
  union: "ZodUnion",
  literal: "ZodLiteral",
  tuple: "ZodTuple",
  enum: "ZodEnum",
  nativeEnum: "ZodNativeEnum",
  optional: "ZodOptional",
  nullable: "ZodNullable",
  default: "ZodDefault",
  effects: "ZodEffects",
};

function getZodDef(schema: any): any | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  return schema._def ?? schema.def;
}

function getZodTypeName(schema: any): string | undefined {
  const def = getZodDef(schema);
  if (def) {
    if (typeof def.typeName === "string") {
      return def.typeName;
    }
    if (typeof def.type === "string") {
      return zodTypeFallbackMap[def.type] ?? def.type;
    }
  }
  return schema?.constructor?.name;
}

function getSchemaDescription(schema: any): string | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  if (typeof schema.description === "string") {
    return schema.description;
  }
  const def = getZodDef(schema);
  if (def && typeof def.description === "string") {
    return def.description;
  }
  return undefined;
}

function isOptionalSchema(schema: any): boolean {
  if (!schema) {
    return false;
  }
  if (typeof schema.isOptional === "function") {
    try {
      if (schema.isOptional()) {
        return true;
      }
    } catch {
      // ignore errors from userland implementations
    }
  }
  const typeName = getZodTypeName(schema);
  return typeName === "ZodOptional" || typeName === "ZodDefault";
}

export interface ToolParameterMetadata {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ToolMetadata {
  name: string;
  description?: string;
  parameters: ToolParameterMetadata[];
  jsonSchema?: JsonSchema;
}

export interface ToolCodeGenerationOptions {
  /**
   * Optional output directory inside the sandbox workspace.
   * Defaults to `{workspace}/local-tools`.
   */
  outputDir?: string;
  /**
   * Optional title used in the generated README.md file.
   */
  title?: string;
  /**
   * Whether to emit TypeScript interfaces generated from the tool schema.
   * Defaults to true.
   */
  emitInterfaces?: boolean;
}

export interface ToolCodeGenerationResult {
  outputDir: string;
  files: string[];
  tools: ToolMetadata[];
}

/**
 * Write AI SDK tool implementations to the sandbox so they can be inspected by the model.
 */
export async function writeToolsToSandbox(
  sandboxProvider: SandboxProvider,
  tools: Record<string, Tool<any, any>>,
  options: ToolCodeGenerationOptions = {}
): Promise<ToolCodeGenerationResult> {
  const workspacePath = sandboxProvider.getWorkspacePath();
  const outputDir = options.outputDir ?? `${workspacePath}/local-tools`;
  const emitInterfaces = options.emitInterfaces ?? true;

  const entries = Object.entries(tools);

  if (entries.length === 0) {
    return {
      outputDir,
      files: [],
      tools: [],
    };
  }

  const filesToWrite: { path: string; content: Buffer }[] = [];
  const toolMetadataList: ToolMetadata[] = [];
  const indexExports: string[] = [];

  const usedFileNames = new Set<string>();

  for (const [toolName, toolDefinition] of entries) {
    const sanitizedIdentifier = toCamelCaseIdentifier(toolName);
    const pascalCaseIdentifier = toPascalCase(sanitizedIdentifier);
    const metadataConstName = `${sanitizedIdentifier}Metadata`;
    const fileBaseName = makeUniqueFileName(
      toKebabCase(toolName || sanitizedIdentifier) || sanitizedIdentifier,
      usedFileNames
    );

    const jsonSchema = schemaToJsonSchema(toolDefinition.inputSchema);
    const parameters = extractParametersFromJsonSchema(jsonSchema);

    const metadata: ToolMetadata = {
      name: toolName,
      description: toolDefinition.description ?? undefined,
      parameters,
      ...(jsonSchema ? { jsonSchema } : {}),
    };
    toolMetadataList.push(metadata);

    const commentBlock = createDocComment(metadata);
    const metadataCode = createMetadataConst(metadataConstName, metadata);

    let interfaceCode = "";
    if (emitInterfaces && jsonSchema?.type === "object") {
      const interfaceName = `${pascalCaseIdentifier}Input`;
      interfaceCode = generateTypeScriptInterface(jsonSchema, interfaceName);
    }

    const functionCode = createExecuteFunctionExport(
      sanitizedIdentifier,
      toolDefinition.execute
    );

    const fileSections = [
      commentBlock,
      metadataCode,
      interfaceCode,
      functionCode,
    ].filter(Boolean);

    const fileContent =
      fileSections.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";

    filesToWrite.push({
      path: `${outputDir}/${fileBaseName}.ts`,
      content: Buffer.from(fileContent, "utf-8"),
    });

    indexExports.push(
      `export { ${sanitizedIdentifier}, ${metadataConstName} } from "./${fileBaseName}.ts";`
    );
  }

  // README
  filesToWrite.push({
    path: `${outputDir}/README.md`,
    content: Buffer.from(
      generateReadme(toolMetadataList, options.title),
      "utf-8"
    ),
  });

  // index.ts
  filesToWrite.push({
    path: `${outputDir}/index.ts`,
    content: Buffer.from(
      `// Auto-generated index for local AI SDK tools\n\n${indexExports.join(
        "\n"
      )}\n`,
      "utf-8"
    ),
  });

  await sandboxProvider.writeFiles(filesToWrite);

  return {
    outputDir,
    files: filesToWrite.map((file) => file.path),
    tools: toolMetadataList,
  };
}

function createDocComment(metadata: ToolMetadata): string {
  const descriptionLines = (
    metadata.description
      ? metadata.description.split(/\r?\n/)
      : ["No description provided."]
  ).map((line) => line || "(empty)");

  const paramLines =
    metadata.parameters.length > 0
      ? metadata.parameters.map((param) => {
          const requirement = param.required ? "required" : "optional";
          const details = param.description ? `: ${param.description}` : "";
          return ` * - ${param.name} (${param.type}, ${requirement})${details}`;
        })
      : [" * - (no structured parameters)"];

  return [
    "/**",
    ` * Tool Name: ${metadata.name}`,
    " *",
    ...descriptionLines.map((line) => ` * ${line}`),
    " *",
    " * Parameters:",
    ...paramLines,
    " */",
  ].join("\n");
}

function createMetadataConst(
  constName: string,
  metadata: ToolMetadata
): string {
  const serialized = JSON.stringify(metadata, null, 2);
  return `export const ${constName} = ${serialized} as const;`;
}

/**
 * Format function code by adding line breaks and indentation
 * Simplified approach: extract the function body and format it
 */
function formatFunctionCode(code: string): string {
  // If code already has multiple lines with proper formatting, return as-is
  const lines = code.split("\n");
  if (
    lines.length > 1 &&
    lines.some((line) => line.trim().length > 0 && line.startsWith("  "))
  ) {
    return code;
  }

  // Find the function body opening brace (after parameter list)
  let bodyBraceIndex = -1;
  let parenDepth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : "";

    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
    }

    if (!inString) {
      if (char === "(") parenDepth++;
      else if (char === ")") parenDepth--;
      else if (char === "{" && parenDepth === 0) {
        bodyBraceIndex = i;
        break;
      }
    }
  }

  if (bodyBraceIndex === -1) {
    return code;
  }

  const signature = code.slice(0, bodyBraceIndex).trim();
  const bodyStart = bodyBraceIndex + 1;

  // Extract the entire function body between the braces
  let body = "";
  let braceDepth = 0;
  inString = false;
  stringChar = "";

  for (let i = bodyStart; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : "";

    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
    }

    if (!inString) {
      if (char === "{") braceDepth++;
      else if (char === "}") {
        if (braceDepth === 0) {
          break; // Found closing brace
        }
        braceDepth--;
      }
    }

    body += char;
  }

  const trimmedBody = body.trim();
  if (!trimmedBody || trimmedBody.length < 30) {
    return code;
  }

  // Simple formatting: split statements and format return objects
  const formattedBody = formatFunctionBody(trimmedBody);

  return `${signature} {\n  ${formattedBody}\n}`;
}

/**
 * Format function body by splitting statements and formatting return objects
 */
function formatFunctionBody(body: string): string {
  // Split into statements by semicolons (respecting strings and nested structures)
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  let parenDepth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    const prevChar = i > 0 ? body[i - 1] : "";

    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
    }

    if (!inString) {
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === "(") parenDepth++;
      else if (char === ")") parenDepth--;
    }

    if (char === ";" && depth === 0 && parenDepth === 0 && !inString) {
      statements.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    statements.push(current.trim());
  }

  // Format each statement
  return statements
    .map((stmt) => formatStatement(stmt))
    .filter((s) => s.length > 0)
    .join(";\n  ");
}

/**
 * Format a single statement, especially return objects
 */
function formatStatement(stmt: string): string {
  if (!stmt.startsWith("return")) {
    return stmt;
  }

  // Check if it's a return with an object
  const returnMatch = stmt.match(/^return\s*(\{.*\})/);
  if (!returnMatch) {
    return stmt;
  }

  const objStr = returnMatch[1];
  // Extract object content (without outer braces)
  const objContent = objStr.slice(1, -1).trim();

  if (!objContent) {
    return stmt;
  }

  // Split properties by commas (respecting nested structures)
  const props = splitObjectProperties(objContent);
  if (props.length <= 1) {
    return stmt; // Keep single property on one line
  }

  const formattedProps = props.join(",\n    ");
  return `return {\n    ${formattedProps}\n  }`;
}

/**
 * Split object properties by commas, respecting nested structures
 */
function splitObjectProperties(content: string): string[] {
  const props: string[] = [];
  let current = "";
  let depth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : "";

    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
    }

    if (!inString) {
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === "(") parenDepth++;
      else if (char === ")") parenDepth--;
      else if (char === "[") bracketDepth++;
      else if (char === "]") bracketDepth--;
    }

    if (
      char === "," &&
      depth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      !inString
    ) {
      props.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    props.push(current.trim());
  }

  return props.filter((p) => p.length > 0);
}

function createExecuteFunctionExport(
  identifier: string,
  execute: Tool<any, any>["execute"]
): string {
  if (typeof execute !== "function") {
    return `// Tool "${identifier}" does not expose an execute function.`;
  }

  const source = execute.toString().trim();
  let result: string;

  if (/^async\s+execute/.test(source)) {
    result = source.replace(
      /^async\s+execute/,
      `export async function ${identifier}`
    );
  } else if (/^execute\s*\(/.test(source)) {
    result = source.replace(/^execute/, `export function ${identifier}`);
  } else if (/^async\s+function\s+\w+/.test(source)) {
    result = source.replace(
      /^async\s+function\s+\w+/,
      `export async function ${identifier}`
    );
  } else if (/^function\s+\w+/.test(source)) {
    result = source.replace(/^function\s+\w+/, `export function ${identifier}`);
  } else if (/^async\s*\(/.test(source) || /^async\s*\{/.test(source)) {
    result = `export const ${identifier} = ${source};`;
  } else if (/^\(/.test(source)) {
    result = `export const ${identifier} = ${source};`;
  } else {
    result = `export const ${identifier} = ${source};`;
  }

  // Format the result before returning
  return formatFunctionCode(result);
}

function schemaToJsonSchema(schema: unknown): JsonSchema | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }

  const schemaObj = schema as any;

  if ("jsonSchema" in schemaObj) {
    const jsonSchema = schemaObj.jsonSchema;
    if (jsonSchema && typeof jsonSchema === "object") {
      return jsonSchema as JsonSchema;
    }
  }

  if (getZodDef(schemaObj)) {
    return zodToJsonSchema(schemaObj);
  }

  return undefined;
}

function zodToJsonSchema(zodSchema: any): JsonSchema | undefined {
  if (!zodSchema) {
    return undefined;
  }

  const schema = unwrapZodType(zodSchema);
  const typeName = getZodTypeName(schema);
  const description = getSchemaDescription(schema);

  if (!typeName) {
    return undefined;
  }

  if (typeName === "ZodObject") {
    const shape = getZodObjectShape(schema);
    if (!shape) {
      const fallback: JsonSchema = { type: "object" };
      if (description) {
        fallback.description = description;
      }
      return fallback;
    }

    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const [key, rawFieldSchema] of Object.entries(shape)) {
      const optional = isOptionalSchema(rawFieldSchema);
      const fieldSchema = optional
        ? unwrapZodType(rawFieldSchema)
        : unwrapZodType(rawFieldSchema);

      properties[key] = zodFieldToJson(fieldSchema);
      if (!optional) {
        required.push(key);
      }
    }

    const objectSchema: JsonSchema = {
      type: "object",
      properties,
    };

    if (required.length > 0) {
      objectSchema.required = required;
    }
    if (description) {
      objectSchema.description = description;
    }
    return objectSchema;
  }

  return zodFieldToJson(schema);
}

function unwrapZodType(schema: any, depth = 0): any {
  if (!schema || depth > 10) {
    return schema;
  }

  const def = getZodDef(schema);

  if (!def) {
    return schema;
  }

  const candidate =
    def.innerType ??
    def.schema ??
    (typeof def.type === "object" ? def.type : undefined) ??
    def.valueType ??
    def.returnType ??
    def.sourceType ??
    def.unwrap ??
    def.base ??
    (typeof schema.unwrap === "function" ? schema.unwrap() : undefined);

  if (candidate && typeof candidate === "object" && candidate !== schema) {
    return unwrapZodType(candidate, depth + 1);
  }

  return schema;
}

function getZodObjectShape(schema: any): Record<string, any> | undefined {
  if (!schema) {
    return undefined;
  }

  if (schema.shape && typeof schema.shape === "object") {
    return schema.shape;
  }

  const def = getZodDef(schema);
  if (!def) {
    return undefined;
  }

  const shape = def.shape;
  if (typeof shape === "function") {
    try {
      return shape();
    } catch {
      return undefined;
    }
  }

  if (shape && typeof shape === "object") {
    return shape;
  }

  return undefined;
}

function zodFieldToJson(inputSchema: any): JsonSchema {
  if (!inputSchema) {
    return { type: "unknown" };
  }

  const schema = unwrapZodType(inputSchema);
  const def = getZodDef(schema);
  const typeName = getZodTypeName(schema);
  const description = getSchemaDescription(schema);

  const base: JsonSchema = {};
  if (description) {
    base.description = description;
  }

  switch (typeName) {
    case "ZodString":
      return { ...base, type: "string" };
    case "ZodNumber":
    case "ZodNaN":
      return { ...base, type: "number" };
    case "ZodBigInt":
      return { ...base, type: "integer" };
    case "ZodBoolean":
      return { ...base, type: "boolean" };
    case "ZodEnum": {
      const values = def?.values ?? [];
      return {
        ...base,
        type: "string",
        enum: Array.isArray(values) ? values : Object.values(values ?? {}),
      };
    }
    case "ZodLiteral":
      return {
        ...base,
        const: def?.value,
        type: typeof def?.value,
      };
    case "ZodArray": {
      const element =
        def?.type ?? def?.element ?? def?.innerType ?? schema.element;
      return {
        ...base,
        type: "array",
        items: zodFieldToJson(element),
      };
    }
    case "ZodObject":
      return zodToJsonSchema(schema) ?? { ...base, type: "object" };
    case "ZodTuple":
      return {
        ...base,
        type: "array",
        items: (def?.items ?? []).map((item: any) => zodFieldToJson(item)),
      };
    case "ZodUnion":
      return {
        ...base,
        anyOf: (def?.options ?? []).map((opt: any) => zodFieldToJson(opt)),
      };
    case "ZodNullable": {
      const inner =
        def?.innerType ?? def?.type ?? (schema.innerType || schema.unwrap?.());
      return {
        ...base,
        type: ["null", getJsonSchemaType(zodFieldToJson(inner))],
      };
    }
    default:
      return { ...base, type: "unknown" };
  }
}

function extractParametersFromJsonSchema(
  schema?: JsonSchema
): ToolParameterMetadata[] {
  if (!schema || schema.type !== "object" || !schema.properties) {
    return [];
  }

  const required = Array.isArray(schema.required)
    ? new Set(schema.required)
    : new Set<string>();

  const entries = Object.entries(schema.properties);

  return entries.map(([name, property]) => {
    const prop = property as JsonSchema;
    return {
      name,
      type: getJsonSchemaType(prop),
      required: required.has(name),
      description:
        typeof prop.description === "string" ? prop.description : undefined,
    };
  });
}

function getJsonSchemaType(schema: JsonSchema): string {
  if (!schema) {
    return "unknown";
  }

  if (Array.isArray(schema.type)) {
    return schema.type.join(" | ");
  }

  if (typeof schema.type === "string") {
    return schema.type;
  }

  if (schema.enum) {
    return schema.enum.map((value: any) => JSON.stringify(value)).join(" | ");
  }

  if (schema.anyOf) {
    return schema.anyOf
      .map((sub: JsonSchema) => getJsonSchemaType(sub))
      .join(" | ");
  }

  if (schema.oneOf) {
    return schema.oneOf
      .map((sub: JsonSchema) => getJsonSchemaType(sub))
      .join(" | ");
  }

  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }

  return "unknown";
}

function generateReadme(tools: ToolMetadata[], title?: string): string {
  const headerTitle = title ?? "Local AI SDK Tools";
  const lines: string[] = [
    `# ${headerTitle}`,
    "",
    "These files were auto-generated from in-process AI SDK tools.",
    "They allow the assistant to inspect tool implementations directly inside the sandbox.",
    "",
    "## Available Tools",
    "",
  ];

  for (const tool of tools) {
    lines.push(`### ${tool.name}`);
    lines.push("");
    lines.push(tool.description ?? "No description provided.");
    lines.push("");

    if (tool.parameters.length > 0) {
      lines.push("| Parameter | Type | Required | Description |");
      lines.push("|-----------|------|----------|-------------|");
      for (const param of tool.parameters) {
        const required = param.required ? "Yes" : "No";
        const description = param.description ?? "";
        lines.push(
          `| ${param.name} | ${param.type} | ${required} | ${description} |`
        );
      }
      lines.push("");
    } else {
      lines.push("_No structured parameters defined._");
      lines.push("");
    }

    if (tool.jsonSchema) {
      lines.push("<details>");
      lines.push("<summary>View JSON Schema</summary>");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(tool.jsonSchema, null, 2));
      lines.push("```");
      lines.push("</details>");
      lines.push("");
    }
  }

  lines.push(
    "🏁 Tip: Use `sandbox_cat`, `sandbox_ls`, or `sandbox_find` to explore these files."
  );

  return lines.join("\n");
}

function toCamelCaseIdentifier(name: string): string {
  const sanitized = sanitizeIdentifier(name);
  return sanitized.replace(/_([a-zA-Z0-9])/g, (_, char: string) =>
    char.toUpperCase()
  );
}

function toPascalCase(name: string): string {
  const camel = toCamelCaseIdentifier(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeIdentifier(name: string): string {
  const replaced = name.replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^[A-Za-z_]/.test(replaced)) {
    return replaced;
  }
  return `tool_${replaced}`;
}

function makeUniqueFileName(base: string, used: Set<string>): string {
  let candidate = base || "tool";
  let index = 1;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}
