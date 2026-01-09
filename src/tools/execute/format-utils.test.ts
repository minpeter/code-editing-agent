import { describe, expect, it } from "bun:test";
import {
  formatBackgroundMessage,
  formatTerminalScreen,
  formatTimeoutMessage,
  stripInternalMarkers,
} from "./format-utils";

const TRIPLE_NEWLINE_PATTERN = /\n{3,}/;
const LEADING_WHITESPACE_PATTERN = /^\s/;
const TRAILING_WHITESPACE_PATTERN = /\s$/;

describe("stripInternalMarkers", () => {
  describe("CEA start markers", () => {
    it("removes start marker from content", () => {
      const content = "some output\n__CEA_S_1767934013546-1__\nmore output";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("__CEA_S_");
      expect(result).toContain("some output");
      expect(result).toContain("more output");
    });

    it("removes multiple start markers", () => {
      const content = "__CEA_S_123-1__\noutput\n__CEA_S_456-2__\nmore output";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("__CEA_S_");
    });
  });

  describe("CEA exit markers", () => {
    it("removes exit marker with exit code", () => {
      const content = "output\n__CEA_E_1767934013546-1_0__\nprompt$";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("__CEA_E_");
      expect(result).toContain("output");
      expect(result).toContain("prompt$");
    });

    it("removes exit marker with non-zero exit code", () => {
      const content = "error output\n__CEA_E_123-1_127__\nprompt$";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("__CEA_E_");
      expect(result).not.toContain("127__");
    });

    it("removes exit marker without exit code (partial)", () => {
      const content = "output\n__CEA_E_123-1___\nprompt$";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("__CEA_E_");
    });
  });

  describe("echo marker commands", () => {
    it("removes echo start marker command", () => {
      const content = "echo __CEA_S_123-1__; ls -la";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("echo __CEA_S_");
      expect(result).toContain("ls -la");
    });

    it("removes echo exit marker command", () => {
      const content = "ls -la; echo __CEA_E_123-1_$?__";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("echo __CEA_E_");
      expect(result).toContain("ls -la");
    });
  });

  describe("tmux wait commands", () => {
    it("removes tmux wait -S command", () => {
      const content = "command; tmux wait -S cea-123-456";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("tmux wait");
      expect(result).toContain("command");
    });

    it("removes tmux wait command without -S flag", () => {
      const content = "command; tmux wait cea-session-123";

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("tmux wait");
    });
  });

  describe("combined markers", () => {
    it("removes all marker types from realistic output", () => {
      const content = `set +H
echo __CEA_S_1767934013546-1__; git diff; echo __CEA_E_1767934013546-1_$?__; tmux wait -S cea-1767934013298
__CEA_S_1767934013546-1__
diff --git a/README.md b/README.md
+++ b/README.md
@@ -2,13 +2,6 @@
__CEA_E_1767934013546-1_0__

minpeters-MacBook-Pro:code-editing-agent minpeter$`;

      const result = stripInternalMarkers(content);

      expect(result).not.toContain("__CEA_S_");
      expect(result).not.toContain("__CEA_E_");
      expect(result).not.toContain("tmux wait");
      expect(result).not.toContain("echo __CEA_");
      expect(result).toContain("diff --git");
      expect(result).toContain("README.md");
    });

    it("preserves user content that looks similar but is not a marker", () => {
      const content = "User typed: __CEA is not a marker\nReal output here";

      const result = stripInternalMarkers(content);

      expect(result).toContain("__CEA is not a marker");
    });
  });

  describe("whitespace handling", () => {
    it("collapses multiple newlines after marker removal", () => {
      const content = "output\n\n\n__CEA_E_123-1_0__\n\n\nprompt$";

      const result = stripInternalMarkers(content);

      expect(result).not.toMatch(TRIPLE_NEWLINE_PATTERN);
    });

    it("trims leading and trailing whitespace", () => {
      const content = "  \n__CEA_S_123-1__\noutput\n__CEA_E_123-1_0__\n  ";

      const result = stripInternalMarkers(content);

      expect(result).not.toMatch(LEADING_WHITESPACE_PATTERN);
      expect(result).not.toMatch(TRAILING_WHITESPACE_PATTERN);
    });
  });
});

describe("formatTerminalScreen", () => {
  it("wraps content with screen markers", () => {
    const content = "hello world";

    const result = formatTerminalScreen(content);

    expect(result).toContain("=== Current Terminal Screen ===");
    expect(result).toContain("hello world");
    expect(result).toContain("=== End of Screen ===");
  });

  it("returns no visible output message for empty content", () => {
    const result = formatTerminalScreen("");

    expect(result).toBe("(no visible output)");
  });

  it("returns no visible output for whitespace-only content", () => {
    const result = formatTerminalScreen("   \n\n   ");

    expect(result).toBe("(no visible output)");
  });

  it("strips internal markers before formatting", () => {
    const content = "__CEA_S_123-1__\nhello world\n__CEA_E_123-1_0__";

    const result = formatTerminalScreen(content);

    expect(result).not.toContain("__CEA_S_");
    expect(result).not.toContain("__CEA_E_");
    expect(result).toContain("hello world");
  });

  it("returns no visible output when only markers present", () => {
    const content = "__CEA_S_123-1__\n__CEA_E_123-1_0__";

    const result = formatTerminalScreen(content);

    expect(result).toBe("(no visible output)");
  });
});

describe("formatTimeoutMessage", () => {
  it("strips markers from terminal screen in timeout message", () => {
    const result = formatTimeoutMessage({
      timeoutMs: 1000,
      terminalScreen: "output\n__CEA_E_123-1_0__\nprompt$",
    });

    expect(result).not.toContain("__CEA_E_");
    expect(result).toContain("output");
    expect(result).toContain("prompt$");
  });
});

describe("formatBackgroundMessage", () => {
  it("strips markers from terminal screen in background message", () => {
    const result = formatBackgroundMessage(
      "output\n__CEA_S_123-1__\nmore output"
    );

    expect(result).not.toContain("__CEA_S_");
    expect(result).toContain("output");
    expect(result).toContain("more output");
  });
});
