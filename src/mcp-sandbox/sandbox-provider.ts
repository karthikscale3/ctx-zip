// Abstract sandbox provider interface

/**
 * Command execution result
 */
export interface CommandResult {
  exitCode: number;
  stdout(): Promise<string>;
  stderr(): Promise<string>;
}

/**
 * File to write to sandbox
 */
export interface SandboxFile {
  path: string;
  content: Buffer;
}

/**
 * Command to execute in sandbox
 */
export interface SandboxCommand {
  cmd: string;
  args: string[];
}

/**
 * Abstract sandbox provider interface
 * Implement this to add support for different sandbox environments
 */
export interface SandboxProvider {
  /**
   * Write multiple files to the sandbox
   */
  writeFiles(files: SandboxFile[]): Promise<void>;

  /**
   * Execute a command in the sandbox
   */
  runCommand(command: SandboxCommand): Promise<CommandResult>;

  /**
   * Stop/cleanup the sandbox
   */
  stop(): Promise<void>;

  /**
   * Get a unique identifier for this sandbox instance
   */
  getId(): string;

  /**
   * Get the workspace directory path (where MCP tools and user code live)
   * This should be the root directory for all generated files.
   * @example "/workspace", "/home/sandbox", "/vercel/sandbox", etc.
   */
  getWorkspacePath(): string;
}

/**
 * Options for creating a sandbox provider
 */
export interface SandboxProviderOptions {
  timeout?: number;
  runtime?: string;
  vcpus?: number;
  [key: string]: any; // Allow provider-specific options
}
