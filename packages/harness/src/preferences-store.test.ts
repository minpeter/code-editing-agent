import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FilePreferencesStore,
  InMemoryPreferencesStore,
  LayeredPreferencesStore,
  shallowMergePreferences,
} from "./preferences-store";

const EMPTY_STORES_PATTERN = /at least one/;
const WRITE_LAYER_OUT_OF_RANGE_PATTERN = /out of range/;

interface TestPrefs extends Record<string, unknown> {
  reasoningMode?: "off" | "on" | "interleaved";
  toolFallbackMode?: "disable" | "morphxml";
  translateEnabled?: boolean;
}

describe("InMemoryPreferencesStore", () => {
  it("returns null before anything is saved", async () => {
    const store = new InMemoryPreferencesStore<TestPrefs>();
    expect(await store.load()).toBeNull();
  });

  it("save then load returns the same value", async () => {
    const store = new InMemoryPreferencesStore<TestPrefs>();
    await store.save({ translateEnabled: false });
    expect(await store.load()).toEqual({ translateEnabled: false });
  });

  it("clear resets to null", async () => {
    const store = new InMemoryPreferencesStore<TestPrefs>();
    await store.save({ translateEnabled: true });
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe("FilePreferencesStore", () => {
  let tmpDir: string;
  let filePath: string;
  let store: FilePreferencesStore<TestPrefs>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "file-prefs-store-test-"));
    filePath = join(tmpDir, "nested", "settings.json");
    store = new FilePreferencesStore<TestPrefs>({ filePath });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when the file does not exist", async () => {
    expect(await store.load()).toBeNull();
  });

  it("creates the parent directory when saving", async () => {
    await store.save({ translateEnabled: false });
    expect(existsSync(filePath)).toBe(true);
  });

  it("save then load round-trips the value", async () => {
    await store.save({
      translateEnabled: false,
      reasoningMode: "on",
      toolFallbackMode: "morphxml",
    });
    expect(await store.load()).toEqual({
      translateEnabled: false,
      reasoningMode: "on",
      toolFallbackMode: "morphxml",
    });
  });

  it("save is atomic (no .tmp files are left behind)", async () => {
    await store.save({ translateEnabled: true });
    const { readdirSync } = await import("node:fs");
    const entries = readdirSync(join(tmpDir, "nested"));
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("save fully replaces prior state", async () => {
    await store.save({ translateEnabled: true, reasoningMode: "on" });
    await store.save({ translateEnabled: false });
    expect(await store.load()).toEqual({ translateEnabled: false });
  });

  it("treats malformed JSON as no-preferences-stored", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(tmpDir, "nested"), { recursive: true });
    writeFileSync(filePath, "{not valid json", "utf8");
    expect(await store.load()).toBeNull();
  });

  it("runs the validator when provided", async () => {
    const validated = new FilePreferencesStore<TestPrefs>({
      filePath,
      validate: (value) => {
        if (typeof value !== "object" || value === null) {
          return null;
        }
        const record = value as Record<string, unknown>;
        if (record.schemaVersion !== 1) {
          return null;
        }
        const { schemaVersion: _ignored, ...rest } = record;
        return rest as TestPrefs;
      },
    });
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(tmpDir, "nested"), { recursive: true });
    writeFileSync(
      filePath,
      JSON.stringify({ schemaVersion: 999, translateEnabled: false }),
      "utf8"
    );
    expect(await validated.load()).toBeNull();
  });

  it("writes human-readable pretty JSON", async () => {
    await store.save({ translateEnabled: false });
    const raw = readFileSync(filePath, "utf8");
    expect(raw).toContain("\n");
    expect(raw.trim().startsWith("{")).toBe(true);
  });
});

describe("LayeredPreferencesStore", () => {
  it("merges layers from low to high priority", async () => {
    const userLayer = new InMemoryPreferencesStore<TestPrefs>();
    const workspaceLayer = new InMemoryPreferencesStore<TestPrefs>();
    await userLayer.save({
      translateEnabled: true,
      reasoningMode: "off",
    });
    await workspaceLayer.save({ reasoningMode: "on" });

    const layered = new LayeredPreferencesStore<TestPrefs>({
      stores: [userLayer, workspaceLayer],
      merge: shallowMergePreferences,
    });

    expect(await layered.load()).toEqual({
      translateEnabled: true,
      reasoningMode: "on",
    });
  });

  it("returns null when all layers are empty", async () => {
    const layered = new LayeredPreferencesStore<TestPrefs>({
      stores: [
        new InMemoryPreferencesStore<TestPrefs>(),
        new InMemoryPreferencesStore<TestPrefs>(),
      ],
      merge: shallowMergePreferences,
    });
    expect(await layered.load()).toBeNull();
  });

  it("returns only user layer when workspace is empty", async () => {
    const userLayer = new InMemoryPreferencesStore<TestPrefs>();
    const workspaceLayer = new InMemoryPreferencesStore<TestPrefs>();
    await userLayer.save({ translateEnabled: false });

    const layered = new LayeredPreferencesStore<TestPrefs>({
      stores: [userLayer, workspaceLayer],
      merge: shallowMergePreferences,
    });
    expect(await layered.load()).toEqual({ translateEnabled: false });
  });

  it("writes to the workspace layer by default, not the user layer", async () => {
    const userLayer = new InMemoryPreferencesStore<TestPrefs>();
    const workspaceLayer = new InMemoryPreferencesStore<TestPrefs>();
    await userLayer.save({ translateEnabled: true });

    const layered = new LayeredPreferencesStore<TestPrefs>({
      stores: [userLayer, workspaceLayer],
      merge: shallowMergePreferences,
    });
    await layered.save({ translateEnabled: false, reasoningMode: "on" });

    expect(await userLayer.load()).toEqual({ translateEnabled: true });
    expect(await workspaceLayer.load()).toEqual({
      translateEnabled: false,
      reasoningMode: "on",
    });
  });

  it("honors an explicit writeLayerIndex", async () => {
    const userLayer = new InMemoryPreferencesStore<TestPrefs>();
    const workspaceLayer = new InMemoryPreferencesStore<TestPrefs>();
    const layered = new LayeredPreferencesStore<TestPrefs>({
      stores: [userLayer, workspaceLayer],
      merge: shallowMergePreferences,
      writeLayerIndex: 0,
    });
    await layered.save({ translateEnabled: false });
    expect(await userLayer.load()).toEqual({ translateEnabled: false });
    expect(await workspaceLayer.load()).toBeNull();
  });

  it("throws if no stores are provided", () => {
    expect(
      () =>
        new LayeredPreferencesStore<TestPrefs>({
          stores: [],
          merge: shallowMergePreferences,
        })
    ).toThrow(EMPTY_STORES_PATTERN);
  });

  it("throws if writeLayerIndex is out of range", () => {
    expect(
      () =>
        new LayeredPreferencesStore<TestPrefs>({
          stores: [new InMemoryPreferencesStore<TestPrefs>()],
          merge: shallowMergePreferences,
          writeLayerIndex: 5,
        })
    ).toThrow(WRITE_LAYER_OUT_OF_RANGE_PATTERN);
  });
});

describe("shallowMergePreferences", () => {
  it("treats undefined fields in next as no-op overrides", () => {
    const merged = shallowMergePreferences<TestPrefs>(
      { translateEnabled: true, reasoningMode: "off" },
      { translateEnabled: undefined, reasoningMode: "on" }
    );
    expect(merged).toEqual({ translateEnabled: true, reasoningMode: "on" });
  });

  it("returns accumulator when next is null", () => {
    const acc: TestPrefs = { translateEnabled: false };
    expect(shallowMergePreferences(acc, null)).toEqual(acc);
  });

  it("returns next (filtered) when accumulator is null", () => {
    expect(
      shallowMergePreferences<TestPrefs>(null, {
        translateEnabled: false,
        reasoningMode: undefined,
      })
    ).toEqual({ translateEnabled: false });
  });

  it("returns null when both inputs are null", () => {
    expect(shallowMergePreferences(null, null)).toBeNull();
  });
});
