// AI SDK tools for exploring and executing code in the sandbox

import { tool } from "ai";
import { z } from "zod";
import type { SandboxProvider } from "./sandbox-provider.js";

/**
 * Create exploration tools for navigating the sandbox file system
 */
export function createExplorationTools(
  sandboxProvider: SandboxProvider,
  serversDir: string
) {
  return {
    sandbox_ls: tool({
      description:
        "List directory contents in the sandbox. Shows files and directories with details.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .default(serversDir)
          .describe("Directory path to list"),
        showHidden: z
          .boolean()
          .optional()
          .default(false)
          .describe("Show hidden files (starting with .)"),
      }),
      async execute({ path, showHidden }) {
        console.log(`[sandbox_ls] ${path}`);
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
          console.log(`[sandbox_ls] ERROR: ${stderr}`);
          return `Error listing directory: ${stderr || "Unknown error"}`;
        }

        return (await result.stdout()) || "Empty directory";
      },
    }),

    sandbox_cat: tool({
      description:
        "Read the contents of a file in the sandbox. Use this to view tool definitions and documentation. REQUIRED: You must provide the 'file' parameter with the full path to the file you want to read.",
      inputSchema: z.object({
        file: z
          .string()
          .describe(
            "Full path to the file to read (REQUIRED). Example: '/vercel/sandbox/servers/README.md'"
          ),
      }),
      async execute({ file }) {
        console.log(`[sandbox_cat] ${file}`);
        if (!file || file.trim() === "") {
          return "Error: 'file' parameter is required and cannot be empty. Please provide the full path to the file you want to read.";
        }

        const result = await sandboxProvider.runCommand({
          cmd: "cat",
          args: [file],
        });

        if (result.exitCode !== 0) {
          const stderr = await result.stderr();
          console.log(`[sandbox_cat] ERROR: ${stderr}`);
          return `Error reading file: ${stderr || "File not found"}`;
        }

        return (await result.stdout()) || "Empty file";
      },
    }),

    sandbox_grep: tool({
      description:
        "Search for a pattern in files within the sandbox. Useful for finding specific functions or text. REQUIRED: You must provide the 'pattern' parameter.",
      inputSchema: z.object({
        pattern: z.string().describe("Pattern to search for (REQUIRED)"),
        path: z
          .string()
          .optional()
          .default(serversDir)
          .describe("Directory or file to search in"),
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
        console.log(`[sandbox_grep] "${pattern}" in ${path}`);
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
          console.log(`[sandbox_grep] ERROR: ${stderr}`);
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
        "Find files by name pattern in the sandbox. Use wildcards like *.ts to find TypeScript files. REQUIRED: You must provide the 'pattern' parameter.",
      inputSchema: z.object({
        pattern: z
          .string()
          .describe("File name pattern (e.g., '*.ts', 'index.*') (REQUIRED)"),
        path: z
          .string()
          .optional()
          .default(serversDir)
          .describe("Directory to search in"),
      }),
      async execute({ pattern, path }) {
        console.log(`[sandbox_find] "${pattern}" in ${path}`);
        if (!pattern || pattern.trim() === "") {
          return "Error: 'pattern' parameter is required and cannot be empty. Please provide a file name pattern.";
        }

        const result = await sandboxProvider.runCommand({
          cmd: "find",
          args: [path, "-name", pattern],
        });

        if (result.exitCode !== 0) {
          const stderr = await result.stderr();
          console.log(`[sandbox_find] ERROR: ${stderr}`);
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
      description: `Execute TypeScript code in the sandbox using tsx. Code is saved in ${userCodeDir} and can import MCP tools using: import { toolName } from '../servers/server-name/index.ts'. REQUIRED: You must provide the 'code' parameter with valid TypeScript code to execute.`,
      inputSchema: z.object({
        code: z
          .string()
          .describe(
            "TypeScript code to execute (REQUIRED). IMPORTANT: Use relative imports with .ts extension like '../servers/grep-app/index.ts' to import MCP tools."
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
        console.log(`[sandbox_exec] ${filename} (${code.length} chars)`);
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
            const execTime = Date.now() - execStartTime;
            console.log(
              `[sandbox_exec] Completed in ${execTime}ms (exit code: ${result.exitCode})`
            );
          } catch (raceError) {
            const execTime = Date.now() - execStartTime;
            console.error(
              `[sandbox_exec] Timeout after ${execTime}ms: ${
                raceError instanceof Error
                  ? raceError.message
                  : String(raceError)
              }`
            );
            throw raceError;
          }

          // Combine stdout and stderr for complete output
          const stdout = await result.stdout();
          const stderr = await result.stderr();
          const output = [stdout, stderr].filter(Boolean).join("\n");

          if (result.exitCode !== 0) {
            console.log(`[sandbox_exec] FAILED (exit code ${result.exitCode})`);
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
          console.error(
            `[sandbox_exec] ERROR: ${
              error instanceof Error ? error.message : String(error)
            }`
          );

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
      description: `Write or overwrite a file in the user code directory (${userCodeDir}). Creates the file if it doesn't exist. SECURITY: Only works in user-code directory.`,
      inputSchema: z.object({
        filename: z
          .string()
          .describe(
            "Name of the file to write (e.g., 'helper.ts', 'utils.ts'). Will be created in user-code directory."
          ),
        content: z.string().describe("The full content to write to the file"),
      }),
      async execute({ filename, content }) {
        console.log(`[sandbox_write_file] ${filename}`);
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
          console.error(
            `[sandbox_write_file] ERROR: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return `Error writing file: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    }),

    sandbox_edit_file: tool({
      description: `Edit a file in the user code directory by replacing text. Replaces 'old_text' with 'new_text'. SECURITY: Only works on files in user-code directory (${userCodeDir}).`,
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
        new_text: z.string().describe("The text to replace old_text with"),
      }),
      async execute({ filename, old_text, new_text }) {
        console.log(`[sandbox_edit_file] ${filename}`);
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
          console.error(
            `[sandbox_edit_file] ERROR: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return `Error editing file: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    }),

    sandbox_delete_file: tool({
      description: `Delete a file in the user code directory (${userCodeDir}). SECURITY: Only works in user-code directory.`,
      inputSchema: z.object({
        filename: z.string().describe("Name of the file to delete"),
      }),
      async execute({ filename }) {
        console.log(`[sandbox_delete_file] ${filename}`);
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
          console.error(
            `[sandbox_delete_file] ERROR: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return `Error deleting file: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    }),
  };
}
