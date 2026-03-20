import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/intent-parser.js";

describe("parseIntent (regex)", () => {
  it("matches 'tạo task fix login bug'", () => {
    const result = parseIntent("tạo task fix login bug");
    expect(result).toEqual({ action: "task.create", params: { title: "fix login bug" } });
  });

  it("matches 'create task deploy v2'", () => {
    const result = parseIntent("create task deploy v2");
    expect(result).toEqual({ action: "task.create", params: { title: "deploy v2" } });
  });

  it("matches 'assign ISS-1 cho CodeBot'", () => {
    const result = parseIntent("assign ISS-1 cho CodeBot");
    expect(result).toEqual({ action: "task.assign", params: { taskId: "ISS-1", agentName: "CodeBot" } });
  });

  it("matches 'list tasks'", () => {
    const result = parseIntent("list tasks");
    expect(result).toEqual({ action: "task.list", params: {} });
  });

  it("matches 'danh sách task'", () => {
    const result = parseIntent("danh sách task");
    expect(result).toEqual({ action: "task.list", params: {} });
  });

  it("matches 'status'", () => {
    const result = parseIntent("status");
    expect(result).toEqual({ action: "status", params: {} });
  });

  it("returns null for unrecognized text", () => {
    const result = parseIntent("hello how are you");
    expect(result).toBeNull();
  });
});
