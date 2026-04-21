import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createUserPreferencesStore,
  patchWorkspacePreferences,
  withStoredSchemaVersion,
} from "./user-preferences";

describe("user-preferences", () => {
  let tmpDir: string;
  let userFilePath: string;
  let workspaceFilePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cea-user-prefs-test-"));
    userFilePath = join(tmpDir, "user", "settings.json");
    workspaceFilePath = join(tmpDir, "workspace", "settings.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no layer has anything", async () => {
    const { store } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    expect(await store.load()).toBeNull();
  });

  it("workspace layer overrides user layer on conflict", async () => {
    await mkdir(dirname(userFilePath), { recursive: true });
    writeFileSync(
      userFilePath,
      JSON.stringify(
        withStoredSchemaVersion({
          translateEnabled: true,
          reasoningMode: "off",
        })
      ),
      "utf8"
    );
    await mkdir(dirname(workspaceFilePath), { recursive: true });
    writeFileSync(
      workspaceFilePath,
      JSON.stringify(withStoredSchemaVersion({ reasoningMode: "on" })),
      "utf8"
    );

    const { store } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    expect(await store.load()).toEqual({
      translateEnabled: true,
      reasoningMode: "on",
    });
  });

  it("returns only user-layer fields when workspace is absent", async () => {
    await mkdir(dirname(userFilePath), { recursive: true });
    writeFileSync(
      userFilePath,
      JSON.stringify(withStoredSchemaVersion({ translateEnabled: false })),
      "utf8"
    );
    const { store } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    expect(await store.load()).toEqual({ translateEnabled: false });
  });

  it("ignores malformed enum values in stored files", async () => {
    await mkdir(dirname(workspaceFilePath), { recursive: true });
    writeFileSync(
      workspaceFilePath,
      JSON.stringify({
        schemaVersion: 1,
        reasoningMode: "not-a-mode",
        translateEnabled: false,
      }),
      "utf8"
    );
    const { store } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    expect(await store.load()).toBeNull();
  });

  it("ignores malformed JSON entirely", async () => {
    await mkdir(dirname(workspaceFilePath), { recursive: true });
    writeFileSync(workspaceFilePath, "{not json", "utf8");
    const { store } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    expect(await store.load()).toBeNull();
  });

  it("saves to workspace layer only", async () => {
    const { store, workspaceStore } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    await store.save({ translateEnabled: false });
    expect(await workspaceStore.load()).toEqual({ translateEnabled: false });
  });

  it("patchWorkspacePreferences merges new fields without clobbering existing ones", async () => {
    const { workspaceStore } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    await workspaceStore.save({
      translateEnabled: true,
      reasoningMode: "on",
    });
    const merged = await patchWorkspacePreferences(workspaceStore, {
      translateEnabled: false,
    });
    expect(merged).toEqual({
      translateEnabled: false,
      reasoningMode: "on",
    });
    expect(await workspaceStore.load()).toEqual({
      translateEnabled: false,
      reasoningMode: "on",
    });
  });

  it("patchWorkspacePreferences treats undefined as no-op", async () => {
    const { workspaceStore } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    await workspaceStore.save({ translateEnabled: true });
    await patchWorkspacePreferences(workspaceStore, {
      translateEnabled: undefined,
    });
    expect(await workspaceStore.load()).toEqual({ translateEnabled: true });
  });

  it("round-trips all three tracked fields", async () => {
    const { store, workspaceStore } = createUserPreferencesStore({
      userFilePath,
      workspaceFilePath,
    });
    await store.save({
      translateEnabled: false,
      reasoningMode: "interleaved",
      toolFallbackMode: "morphxml",
    });
    expect(await workspaceStore.load()).toEqual({
      translateEnabled: false,
      reasoningMode: "interleaved",
      toolFallbackMode: "morphxml",
    });
    expect(await store.load()).toEqual({
      translateEnabled: false,
      reasoningMode: "interleaved",
      toolFallbackMode: "morphxml",
    });
  });
});
