import { describe, expect, it } from "vitest";
import { buildScrollbackPreservingResetGap } from "./agent-tui";

describe("new session scrollback preservation helpers", () => {
  it("moves to the last row and writes one CRLF per terminal row to push the current viewport into scrollback", () => {
    expect(buildScrollbackPreservingResetGap(3)).toBe("\x1b[3;1H\r\n\r\n\r\n");
  });

  it("still emits at least one newline for degenerate row counts", () => {
    expect(buildScrollbackPreservingResetGap(0)).toBe("\x1b[1;1H\r\n");
  });
});
