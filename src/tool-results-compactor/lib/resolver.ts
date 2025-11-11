import path from "node:path";
import {
  LocalFileAdapter,
  fileUriToOptions,
  type FileAdapter as IFileAdapter,
} from "../../sandbox-code-generator/file-adapter.js";

export type UriOrAdapter = string | IFileAdapter | undefined;

export function createFileAdapter(uriOrAdapter?: UriOrAdapter): IFileAdapter {
  if (typeof uriOrAdapter === "object" && uriOrAdapter) return uriOrAdapter;
  const uri = typeof uriOrAdapter === "string" ? uriOrAdapter : undefined;
  if (!uri) {
    return new LocalFileAdapter({ baseDir: process.cwd() });
  }
  const lower = uri.toLowerCase();
  if (lower.startsWith("file:")) {
    const options = fileUriToOptions(uri);
    return new LocalFileAdapter(options);
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
