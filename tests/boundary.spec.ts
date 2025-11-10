import type { ModelMessage } from "ai";
import assert from "node:assert/strict";
import {
  compactMessages,
  type Boundary,
  type FileAdapter,
  type FileWriteParams,
  type FileWriteResult,
} from "../src/index";

class MemoryFileAdapter implements FileAdapter {
  public writes: { key: string; body: string; contentType?: string }[] = [];
  private prefix: string;
  constructor(prefix = "mem") {
    this.prefix = prefix;
  }
  async write(params: FileWriteParams): Promise<FileWriteResult> {
    const bodyStr =
      typeof params.body === "string"
        ? params.body
        : new TextDecoder().decode(params.body);
    this.writes.push({
      key: params.key,
      body: bodyStr,
      contentType: params.contentType,
    });
    return { key: params.key };
  }
  resolveKey(name: string): string {
    return `${this.prefix}/${name}`;
  }
  toString(): string {
    return `file:///${this.prefix}`;
  }
}

function makeConversation(): ModelMessage[] {
  // Larger synthetic conversation with multiple tool results across turns
  return [
    // 0
    { role: "system", content: "You are helpful." },
    // 1
    { role: "user", content: "Start by fetching A" },
    // 2 - assistant tool-call (no text)
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolName: "fetchData",
          args: { query: "A" },
        },
      ],
    } as any,
    // 3 - tool result (will be compacted depending on boundary)
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolName: "fetchData",
          result: "ok",
          output: { type: "json", value: { a: 1 } },
        },
      ],
    } as any,
    // 4
    { role: "assistant", content: "Fetched A" },
    // 5
    { role: "user", content: "Read file B" },
    // 6 - assistant tool-call for readFile
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolName: "readFile",
          args: { path: "tmp/data.txt" },
        },
      ],
    } as any,
    // 7 - reader tool (should be replaced with reference text when in window)
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolName: "readFile",
          result: "ok",
          output: {
            type: "json",
            value: {
              storage: "file:///tmp",
              key: "tmp/data.txt",
              fileName: "data.txt",
            },
          },
        },
      ],
    } as any,
    // 8
    { role: "assistant", content: "Read B" },
    // 9
    { role: "user", content: "Fetch C" },
    // 10 - assistant tool-call for fetch C
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolName: "fetchData",
          args: { query: "C" },
        },
      ],
    } as any,
    // 11 - tool result (later one)
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolName: "fetchData",
          result: "ok",
          output: { type: "json", value: { c: 3 } },
        },
      ],
    } as any,
    // 12 (final, required by strategy to trigger compaction)
    { role: "assistant", content: "All done" },
  ];
}

async function run(boundary: Boundary) {
  const adapter = new MemoryFileAdapter("test");
  const messages = makeConversation();
  const compacted = await compactMessages(messages, {
    baseDir: adapter,
    boundary,
  });
  // eslint-disable-next-line no-console
  console.log("\n=== Boundary PRE ===\n", JSON.stringify(boundary, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(messages, null, 2));
  // eslint-disable-next-line no-console
  console.log("\n=== Boundary POST ===\n", JSON.stringify(boundary, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(compacted, null, 2));
  return { compacted, adapter };
}

async function testSinceLastAssistantOrUserText() {
  const { compacted, adapter } = await run("last-turn");
  // Window starts after last user/assistant text (index 9), so only index 11 is compacted.
  assert.equal(adapter.writes.length, 1);
  // Index 3 remains JSON (older fetch)
  {
    const t = compacted[3] as any;
    const p = t.content[0];
    assert.equal(p.output.type, "json");
  }
  // Index 7 (readFile tool result) remains JSON (outside window)
  {
    const t = compacted[7] as any;
    const p = t.content[0];
    assert.equal(p.output.type, "json");
  }
  // Index 11 is written and replaced with text reference
  {
    const t = compacted[11] as any;
    const p = t.content[0];
    assert.equal(p.type, "tool-result");
    assert.equal(p.output.type, "text");
    assert.match(p.output.value, /Written to file:/);
  }
}

async function testEntireConversation() {
  const { compacted, adapter } = await run("all");
  // All tool results before final assistant are processed: indices 3(fetchData),7(readFile),11(fetchData)
  // Only the two fetchData results are written; readFile is reference-only.
  assert.equal(adapter.writes.length, 2);
  // Index 2 written
  {
    const t = compacted[3] as any;
    const p = t.content[0];
    assert.equal(p.output.type, "text");
    assert.match(p.output.value, /Written to file:/);
  }
  // Index 5 shows reference to file, not a write
  {
    const t = compacted[7] as any;
    const p = t.content[0];
    assert.equal(p.output.type, "text");
    assert.match(p.output.value, /Read from file:/);
  }
  // Index 8 written
  {
    const t = compacted[11] as any;
    const p = t.content[0];
    assert.equal(p.output.type, "text");
    assert.match(p.output.value, /Written to file:/);
  }
}

async function testFirstNMessages() {
  // Preserve the latest 3 messages; compact the older ones.
  // Latest 3 are indices 10(assistant tool-call), 11(tool fetchData), 12(assistant). So we compact [0..10).
  const { compacted, adapter } = await run({
    type: "keep-last",
    count: 3,
  });
  // One write expected: index 3 (fetchData). Index 7 (readFile) becomes reference. Index 11 is preserved.
  assert.equal(adapter.writes.length, 1);
  // Index 2 is written (text)
  {
    const t = compacted[3] as any;
    const p = t.content[0];
    assert.equal(p.output.type, "text");
    assert.match(p.output.value, /Written to file:/);
  }
  // Index 5 becomes a reference text (readFile inside window)
  {
    const t = compacted[7] as any;
    const p = t.content[0];
    assert.equal(p.output.type, "text");
    assert.match(p.output.value, /Read from file:/);
  }
  // Index 11 remains JSON (preserved due to latest N)
  {
    const t = compacted[11] as any;
    const p = t.content[0];
    assert.equal(p.output.type, "json");
  }
}

(async () => {
  await testSinceLastAssistantOrUserText();
  await testEntireConversation();
  await testFirstNMessages();
  // eslint-disable-next-line no-console
  console.log("Boundary tests passed");
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
