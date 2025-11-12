// AI SDK tools for exploring and executing code in the sandbox

import { tool } from "ai";
import { z } from "zod";
import type { SandboxProvider } from "./sandbox-provider.js";

/**
 * Create exploration tools for navigating the sandbox file system
 */
export function createExplorationTools(
  sandboxProvider: SandboxProvider,
  baseDir: string
) {
  return {
    sandbox_ls: tool({
      description:
        "List directory contents in the sandbox. Shows files and directories with details. Can explore any directory by providing a path (relative or absolute). Defaults to base directory if no path provided.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .default(baseDir)
          .describe(
            "Directory path to list (e.g., 'mcp/github', '/full/path/to/dir', './subdirectory'). Defaults to base directory. Can explore any subdirectory within the sandbox."
          ),
        showHidden: z
          .boolean()
          .optional()
          .default(false)
          .describe("Show hidden files (starting with .)"),
      }),
      async execute({ path, showHidden }) {
        const args = ["-la", path];
        if (!showHidden) {
          args.splice(1, 0, "-A"); // -A shows hidden but not . and ..
        }

        const result = await sandboxProvider.runCommand({
          cmd: "ls",
          args,
        });

        if (result.exitCode !== 0) {
          const stderr = await result.stderr();
          return `Error listing directory: ${stderr || "Unknown error"}`;
        }

        return (await result.stdout()) || "Empty directory";
      },
    }),

    sandbox_cat: tool({
      description:
        "Read the contents of a file in the sandbox. REQUIRED: You must provide the 'file' parameter with the path to the file.",
      inputSchema: z.object({
        file: z.string().describe("Path to the file to read (REQUIRED)"),
      }),
      async execute({ file }) {
        if (!file || file.trim() === "") {
          return "Error: 'file' parameter is required and cannot be empty. Please provide the full path to the file you want to read.";
        }

        const result = await sandboxProvider.runCommand({
          cmd: "cat",
          args: [file],
        });

        if (result.exitCode !== 0) {
          const stderr = await result.stderr();
          return `Error reading file: ${stderr || "File not found"}`;
        }

        const content = (await result.stdout()) || "Empty file";

        // If this looks like a compacted tool result JSON, parse it and return just the output
        // This prevents the model from echoing large JSON structures
        if (
          content.includes('"metadata"') &&
          content.includes('"toolName"') &&
          content.includes('"output"')
        ) {
          try {
            const parsed = JSON.parse(content);
            if (parsed.output) {
              // Return the actual tool output, not the metadata wrapper
              return typeof parsed.output === "string"
                ? parsed.output
                : JSON.stringify(parsed.output, null, 2);
            }
          } catch (e) {
            // If parsing fails, return content as-is
          }
        }

        return content;
      },
    }),

    sandbox_grep: tool({
      description:
        "Search for a pattern in files within the sandbox. Can search in any directory or file. REQUIRED: You must provide the 'pattern' parameter.",
      inputSchema: z.object({
        pattern: z.string().describe("Pattern to search for (REQUIRED)"),
        path: z
          .string()
          .optional()
          .default(baseDir)
          .describe(
            "Directory or file to search in (e.g., 'mcp', 'user-code/script.ts', or full path). Defaults to base directory."
          ),
        recursive: z
          .boolean()
          .optional()
          .default(true)
          .describe("Search recursively in subdirectories"),
        caseInsensitive: z
          .boolean()
          .optional()
          .default(false)
          .describe("Case-insensitive search"),
      }),
      async execute({ pattern, path, recursive, caseInsensitive }) {
        if (!pattern || pattern.trim() === "") {
          return "Error: 'pattern' parameter is required and cannot be empty. Please provide a search pattern.";
        }

        const args: string[] = ["-n"]; // Show line numbers

        if (recursive) {
          args.push("-r");
        }
        if (caseInsensitive) {
          args.push("-i");
        }

        args.push(pattern, path);

        const result = await sandboxProvider.runCommand({
          cmd: "grep",
          args,
        });

        // grep returns exit code 1 when no matches found, which is not an error
        if (result.exitCode !== 0 && result.exitCode !== 1) {
          const stderr = await result.stderr();
          return `Error searching: ${stderr || "Unknown error"}`;
        }

        const stdout = await result.stdout();
        if (!stdout || stdout.trim() === "") {
          return `No matches found for pattern: ${pattern}`;
        }

        return stdout;
      },
    }),

    sandbox_find: tool({
      description:
        "Find files by name pattern in the sandbox. Can search in any directory. Use wildcards like *.json to find files. REQUIRED: You must provide the 'pattern' parameter.",
      inputSchema: z.object({
        pattern: z
          .string()
          .describe(
            "File name pattern (e.g., '*.json', 'fetchEmails.*', '*.ts') (REQUIRED)"
          ),
        path: z
          .string()
          .optional()
          .default(baseDir)
          .describe(
            "Directory to search in (e.g., 'mcp', 'local-tools', or full path). Defaults to base directory. Searches recursively in subdirectories."
          ),
      }),
      async execute({ pattern, path }) {
        if (!pattern || pattern.trim() === "") {
          return "Error: 'pattern' parameter is required and cannot be empty. Please provide a file name pattern.";
        }

        const result = await sandboxProvider.runCommand({
          cmd: "find",
          args: [path, "-name", pattern],
        });

        if (result.exitCode !== 0) {
          const stderr = await result.stderr();
          return `Error finding files: ${stderr || "Unknown error"}`;
        }

        const stdout = await result.stdout();
        if (!stdout || stdout.trim() === "") {
          return `No files found matching: ${pattern}`;
        }

        return stdout;
      },
    }),
  };
}

/**
 * Create execution tool for running code in the sandbox
 */
export function createExecutionTool(
  sandboxProvider: SandboxProvider,
  userCodeDir: string
) {
  return {
    sandbox_exec: tool({
      description: `Execute TypeScript code in the sandbox using tsx. Code is saved in ${userCodeDir}. IMPORTS: From user-code, use '../mcp/server-name/' for MCP tools, '../local-tools/' for local tools, and '../compact/' for compacted results. REQUIRED: You must provide the 'code' parameter with valid TypeScript code to execute.`,
      inputSchema: z.object({
        code: z
          .string()
          .describe(
            "TypeScript code to execute (REQUIRED). IMPORTS: Use '../mcp/server-name/' for MCP tools, '../local-tools/' for local tools, '../compact/' for compacted results."
          ),
        filename: z
          .string()
          .optional()
          .default("script.ts")
          .describe(
            `Filename to save in ${userCodeDir}. Defaults to 'script.ts' if not provided.`
          ),
      }),
      async execute({ code, filename }) {
        if (!code || code.trim() === "") {
          return "Error: 'code' parameter is required and cannot be empty. Please provide valid TypeScript code to execute.";
        }
        const scriptPath = `${userCodeDir}/${filename}`;

        try {
          // Ensure user-code directory exists
          await sandboxProvider.runCommand({
            cmd: "mkdir",
            args: ["-p", userCodeDir],
          });

          // Write the code to a file
          await sandboxProvider.writeFiles([
            {
              path: scriptPath,
              content: Buffer.from(code, "utf-8"),
            },
          ]);

          // Execute with timeout
          const execStartTime = Date.now();
          const executionPromise = sandboxProvider.runCommand({
            cmd: "npx",
            args: ["tsx", scriptPath],
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("Execution timeout after 60 seconds")),
              60000
            );
          });

          let result;
          try {
            result = await Promise.race([executionPromise, timeoutPromise]);
          } catch (raceError) {
            throw raceError;
          }

          // Combine stdout and stderr for complete output
          const stdout = await result.stdout();
          const stderr = await result.stderr();
          const output = [stdout, stderr].filter(Boolean).join("\n");

          if (result.exitCode !== 0) {
            return `⚠️ Script execution failed (exit code ${result.exitCode})

File: ${scriptPath}

📋 Full Output (stdout + stderr):
${output || "(no output)"}

💡 Tip: Check for syntax errors, missing imports, or runtime errors above. Fix the code and try again.`;
          }

          return `✓ Execution successful
File: ${scriptPath}

Output:
${stdout || "(no output)"}${stderr ? `\n\nWarnings/Info:\n${stderr}` : ""}`;
        } catch (error) {
          // Try to get stdout/stderr from the error if it's a CommandExitError
          let errorDetails = "";
          let capturedOutput = "";

          if (error && typeof error === "object" && "result" in error) {
            const result = (error as any).result;
            if (result) {
              try {
                const stdout = result.stdout
                  ? typeof result.stdout === "function"
                    ? await result.stdout()
                    : result.stdout
                  : "";
                const stderr = result.stderr
                  ? typeof result.stderr === "function"
                    ? await result.stderr()
                    : result.stderr
                  : "";

                errorDetails = `
Exit Code: ${result.exitCode || "unknown"}
Stdout: ${stdout || "(empty)"}
Stderr: ${stderr || "(empty)"}`;
                capturedOutput = [stdout, stderr].filter(Boolean).join("\n");
              } catch (e) {
                // Ignore extraction errors
              }
            }
          }

          return `⚠️ Execution error: ${
            error instanceof Error ? error.message : String(error)
          }${errorDetails}${
            capturedOutput ? `\n\nCaptured Output:\n${capturedOutput}` : ""
          }

This is a system-level error (not a code error). The script couldn't be executed. Check if the file was written correctly or if there's a sandbox issue.`;
        }
      },
    }),

    sandbox_write_file: tool({
      description: `Write or overwrite a file in the user code directory (${userCodeDir}). Creates the file if it doesn't exist. SECURITY: Only works in user-code directory. IMPORTS: From user-code, use '../mcp/server-name/' for MCP tools, '../local-tools/' for local tools, and '../compact/' for compacted results.`,
      inputSchema: z.object({
        filename: z
          .string()
          .describe(
            "Name of the file to write (e.g., 'helper.ts', 'utils.ts'). Will be created in user-code directory."
          ),
        content: z
          .string()
          .describe(
            "The full content to write to the file. When importing: use '../mcp/server-name/' for MCP tools, '../local-tools/' for local tools, '../compact/' for compacted results."
          ),
      }),
      async execute({ filename, content }) {
        if (!filename || filename.trim() === "") {
          return "Error: 'filename' parameter is required and cannot be empty.";
        }
        if (content === undefined || content === null) {
          return "Error: 'content' parameter is required.";
        }

        try {
          // Security: Block path traversal attempts
          if (filename.includes("..") || filename.includes("/")) {
            return `Error: Invalid filename '${filename}'. Only simple filenames are allowed (no paths or '..'). The file will be created in ${userCodeDir}.`;
          }

          const filePath = `${userCodeDir}/${filename}`;

          // Ensure user-code directory exists
          await sandboxProvider.runCommand({
            cmd: "mkdir",
            args: ["-p", userCodeDir],
          });

          // Write the file
          await sandboxProvider.writeFiles([
            {
              path: filePath,
              content: Buffer.from(content, "utf-8"),
            },
          ]);

          return `✓ File written successfully: ${filePath}`;
        } catch (error) {
          return `Error writing file: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    }),

    sandbox_edit_file: tool({
      description: `Edit a file in the user code directory by replacing text. Replaces 'old_text' with 'new_text'. SECURITY: Only works on files in user-code directory (${userCodeDir}). IMPORTS: From user-code, use '../mcp/server-name/' for MCP tools, '../local-tools/' for local tools, and '../compact/' for compacted results.`,
      inputSchema: z.object({
        filename: z
          .string()
          .describe(
            "Name of the file to edit in user-code directory (e.g., 'script.ts')"
          ),
        old_text: z
          .string()
          .describe(
            "The exact text to find and replace. Must match exactly (including whitespace)."
          ),
        new_text: z
          .string()
          .describe(
            "The text to replace old_text with. When importing: use '../mcp/server-name/' for MCP tools, '../local-tools/' for local tools, '../compact/' for compacted results."
          ),
      }),
      async execute({ filename, old_text, new_text }) {
        if (!filename || filename.trim() === "") {
          return "Error: 'filename' parameter is required and cannot be empty.";
        }
        if (old_text === undefined || old_text === null) {
          return "Error: 'old_text' parameter is required.";
        }
        if (new_text === undefined || new_text === null) {
          return "Error: 'new_text' parameter is required.";
        }

        try {
          // Security: Block path traversal attempts
          if (filename.includes("..") || filename.includes("/")) {
            return `Error: Invalid filename '${filename}'. Only simple filenames in ${userCodeDir} are allowed.`;
          }

          const filePath = `${userCodeDir}/${filename}`;

          // Read the current file
          const catResult = await sandboxProvider.runCommand({
            cmd: "cat",
            args: [filePath],
          });

          if (catResult.exitCode !== 0) {
            const stderr = await catResult.stderr();
            return `Error: File not found or cannot be read: ${filePath}\n${stderr}`;
          }

          const currentContent = await catResult.stdout();

          // Check if old_text exists in the file
          if (!currentContent.includes(old_text)) {
            return `Error: The text to replace was not found in ${filePath}.\n\nSearched for:\n${old_text.substring(
              0,
              200
            )}...\n\nMake sure the text matches exactly (including whitespace).`;
          }

          // Check for multiple matches
          const matches = currentContent.split(old_text).length - 1;
          if (matches > 1) {
            return `Error: Found ${matches} matches for the text in ${filePath}. Please provide more specific text that matches only once.`;
          }

          // Perform the replacement
          const newContent = currentContent.replace(old_text, new_text);

          // Write the modified content back
          await sandboxProvider.writeFiles([
            {
              path: filePath,
              content: Buffer.from(newContent, "utf-8"),
            },
          ]);

          return `✓ File edited successfully: ${filePath}\n\nReplaced:\n${old_text.substring(
            0,
            100
          )}...\n\nWith:\n${new_text.substring(0, 100)}...`;
        } catch (error) {
          return `Error editing file: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    }),

    sandbox_delete_file: tool({
      description: `Delete a file in the user code directory (${userCodeDir}). SECURITY: Only works in user-code directory. NOTE: From user-code, relative imports are '../mcp/server-name/' for MCP tools, '../local-tools/' for local tools, and '../compact/' for compacted results.`,
      inputSchema: z.object({
        filename: z
          .string()
          .describe("Name of the file to delete in user-code directory"),
      }),
      async execute({ filename }) {
        if (!filename || filename.trim() === "") {
          return "Error: 'filename' parameter is required and cannot be empty.";
        }

        const filePath = `${userCodeDir}/${filename}`;

        try {
          await sandboxProvider.runCommand({
            cmd: "rm",
            args: [filePath],
          });

          return `✓ File deleted successfully: ${filePath}`;
        } catch (error) {
          return `Error deleting file: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    }),

    sandbox_lint: tool({
      description: `Lint a TypeScript file in ${userCodeDir} and check for errors without executing it. Use this after writing code with sandbox_write_file or sandbox_exec to validate the code. Uses TypeScript compiler to check for type errors, syntax errors, and other issues.`,
      inputSchema: z.object({
        filename: z
          .string()
          .describe(
            `Filename in ${userCodeDir} to lint (e.g., 'script.ts', 'helper.ts')`
          ),
      }),
      async execute({ filename }) {
        if (!filename || filename.trim() === "") {
          return "Error: 'filename' parameter is required and cannot be empty.";
        }

        try {
          // Security: Block path traversal
          if (filename.includes("..") || filename.includes("/")) {
            return `Error: Invalid filename '${filename}'. Only simple filenames in ${userCodeDir} are allowed.`;
          }

          const filePath = `${userCodeDir}/${filename}`;

          // Check if file exists
          const checkResult = await sandboxProvider.runCommand({
            cmd: "test",
            args: ["-f", filePath],
          });

          if (checkResult.exitCode !== 0) {
            return `Error: File not found: ${filePath}`;
          }

          // Run TypeScript compiler in no-emit mode to check for errors
          const result = await sandboxProvider.runCommand({
            cmd: "npx",
            args: [
              "tsc",
              "--noEmit",
              "--pretty",
              "false",
              "--skipLibCheck",
              filePath,
            ],
          });

          const stdout = await result.stdout();
          const stderr = await result.stderr();
          const output = [stdout, stderr].filter(Boolean).join("\n");

          if (result.exitCode === 0) {
            return `✓ No TypeScript errors found\n\nFile: ${filePath}\n\nThe code passes TypeScript compilation checks.`;
          }

          return `⚠️ TypeScript errors found\n\nFile: ${filePath}\n\n${
            output || "(no error details available)"
          }\n\n💡 Fix these errors before executing the code.`;
        } catch (error) {
          return `Error during linting: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    }),
  };
}
