import { describe, expect, it } from "vitest";
import { splitMessage } from "../src/utils/splitter.js";

describe("splitMessage", () => {
  it("returns single chunk for short message", () => {
    expect(splitMessage("hello", 4096)).toEqual(["hello"]);
  });

  it("splits at newline boundary when possible", () => {
    const line = "x".repeat(2000);
    const text = `${line}\n${line}\n${line}`;
    const chunks = splitMessage(text, 4096);
    expect(chunks.length).toBe(2);
    expect(chunks.every((c) => c.length <= 4096)).toBe(true);
  });

  it("hard splits at limit when no newline found", () => {
    const text = "x".repeat(5000);
    const chunks = splitMessage(text, 4096);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(4096);
    expect(chunks[1].length).toBe(904);
  });

  it("handles empty string", () => {
    expect(splitMessage("", 4096)).toEqual([""]);
  });
});
