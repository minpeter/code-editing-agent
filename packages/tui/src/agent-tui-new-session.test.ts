import { describe, expect, it } from "vitest";
import { buildScrollbackPreservingResetGap } from "./agent-tui";

describe("new session scrollback preservation helpers", () => {
  it("writes one newline per terminal row to push the current viewport into scrollback", () => {
    expect(buildScrollbackPreservingResetGap(3)).toBe("\n\n\n");
  });

  it("still emits at least one newline for degenerate row counts", () => {
    expect(buildScrollbackPreservingResetGap(0)).toBe("\n");
  });
});
