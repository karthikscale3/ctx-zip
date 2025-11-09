import readline from "node:readline";
import type { FileAdapter } from "./types";

export interface GrepResultLine {
  lineNumber: number;
  line: string;
}

export async function grepObject(
  adapter: FileAdapter,
  key: string,
  pattern: RegExp
): Promise<GrepResultLine[]> {
  if (adapter.openReadStream) {
    const stream = await adapter.openReadStream({ key });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const out: GrepResultLine[] = [];
    let lineNumber = 0;
    for await (const line of rl) {
      lineNumber++;
      if (pattern.test(line)) out.push({ lineNumber, line });
    }
    return out;
  }

  if (adapter.readText) {
    const text = await adapter.readText({ key });
    const out: GrepResultLine[] = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (pattern.test(line)) out.push({ lineNumber: idx + 1, line });
    });
    return out;
  }

  throw new Error("Adapter does not support read operations needed for grep.");
}
