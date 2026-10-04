import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson, readLimited } from "@/lib/http/request";

const streamOf = (chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(x); c.close(); } });
const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://x.test/", { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);

describe("bounded request bodies", () => {
  it("returns small bodies intact", async () => {
    const r = await readLimited(post(new Uint8Array([1, 2, 3])), 10);
    expect(Array.from(r!)).toEqual([1, 2, 3]);
  });
  it("refuses a body whose declared length is too big without reading it", async () => {
    expect(await readLimited(post("x", { "content-length": "999999" }), 100)).toBeNull();
  });
  it("stops reading a chunked body that has no declared length once it passes the limit", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); if (pulled > 100000) c.close(); } });
    expect(await readLimited(post(endless), 4096)).toBeNull();
    expect(pulled).toBeLessThan(50); // gave up early instead of consuming the endless stream
  });
  it("accepts a chunked body that fits", async () => {
    const r = await readLimited(post(streamOf([new Uint8Array(100), new Uint8Array(100)])), 300);
    expect(r!.byteLength).toBe(200);
  });
  it("readJson enforces the content type, the size and the schema", async () => {
    const schema = z.object({ a: z.number() });
    const json = (b: string, ct = "application/json") => post(b, { "content-type": ct });
    expect(await readJson(json('{"a":1}'), schema)).toEqual({ a: 1 });
    expect(await readJson(json('{"a":1}', "text/plain"), schema)).toBeNull();
    expect(await readJson(json('{"a":"x"}'), schema)).toBeNull();
    expect(await readJson(json("not json"), schema)).toBeNull();
    expect(await readJson(json(JSON.stringify({ a: 1, pad: "x".repeat(20_000) })), schema)).toBeNull();
    expect(await readJson(json(JSON.stringify({ a: 1, pad: "x".repeat(20_000) })), schema, 50_000)).toEqual({ a: 1 });
  });
});
