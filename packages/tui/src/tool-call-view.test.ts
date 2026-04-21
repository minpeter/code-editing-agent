import type { MarkdownTheme } from "@mariozechner/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseToolCallView } from "./tool-call-view";

const markdownTheme: MarkdownTheme = {
  heading: (t) => t,
  link: (t) => t,
  linkUrl: (t) => t,
  code: (t) => t,
  codeBlock: (t) => t,
  codeBlockBorder: (t) => t,
  quote: (t) => t,
  quoteBorder: (t) => t,
  hr: (t) => t,
  listBullet: (t) => t,
  bold: (t) => t,
  italic: (t) => t,
  strikethrough: (t) => t,
  underline: (t) => t,
};

describe("BaseToolCallView fallback pending indicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderView = (view: BaseToolCallView): string =>
    view.render(120).join("\n");

  it("shows Executing... spinner when input is set but output is pending", async () => {
    const view = new BaseToolCallView(
      "call_1",
      "shell_execute",
      markdownTheme,
      () => undefined
    );
    view.setFinalInput({ command: "ls -la" });

    const output = renderView(view);
    expect(output).toContain("Executing...");
    expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

    view.dispose();
  });

  it("removes the indicator once output arrives", async () => {
    const view = new BaseToolCallView(
      "call_2",
      "shell_execute",
      markdownTheme,
      () => undefined
    );
    view.setFinalInput({ command: "ls" });
    expect(renderView(view)).toContain("Executing...");

    view.setOutput("file-a\nfile-b\n");
    expect(renderView(view)).not.toContain("Executing...");

    view.dispose();
  });

  it("removes the indicator once an error is reported", async () => {
    const view = new BaseToolCallView(
      "call_3",
      "shell_execute",
      markdownTheme,
      () => undefined
    );
    view.setFinalInput({ command: "false" });
    expect(renderView(view)).toContain("Executing...");

    view.setError(new Error("boom"));
    expect(renderView(view)).not.toContain("Executing...");

    view.dispose();
  });

  it("does not render the indicator before any input is captured", () => {
    const view = new BaseToolCallView(
      "call_4",
      "shell_execute",
      markdownTheme,
      () => undefined
    );

    expect(renderView(view)).not.toContain("Executing...");

    view.dispose();
  });
});
