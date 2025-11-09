import path from "node:path";
import { FileAdapter, fileUriToOptions } from "./file";
import type { FileAdapter as IFileAdapter, UriOrAdapter } from "./types";

export function createFileAdapter(uriOrAdapter?: UriOrAdapter): IFileAdapter {
  if (typeof uriOrAdapter === "object" && uriOrAdapter) return uriOrAdapter;
  const uri = typeof uriOrAdapter === "string" ? uriOrAdapter : undefined;
  if (!uri) {
    return new FileAdapter({ baseDir: process.cwd() });
  }
  const lower = uri.toLowerCase();
  if (lower.startsWith("file:")) {
    const options = fileUriToOptions(uri);
    return new FileAdapter(options);
  }
  throw new Error(
    `Unsupported storage URI: ${uri}. Only file:// URIs are supported.`
  );
}

export function resolveFileUriFromBaseDir(
  baseDir: string,
  sessionId?: string
): string {
  const abs = path.resolve(baseDir);
  return `file://${abs}`;
}
