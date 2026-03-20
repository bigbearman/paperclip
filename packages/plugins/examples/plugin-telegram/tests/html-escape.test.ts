import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/utils/html-escape.js";

describe("escapeHtml", () => {
  it("escapes <, >, &", () => {
    expect(escapeHtml("<b>test</b> & 'foo'")).toBe(
      "&lt;b&gt;test&lt;/b&gt; &amp; 'foo'"
    );
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("passes through safe text unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });
});
