import type { ModelMessage } from "ai";
import type {
  CheckpointHistory,
  CheckpointHistoryOptions,
} from "../checkpoint-history";
import type { Command } from "../commands";
import type { HistorySnapshot } from "../history-snapshot";
import type { SessionManager } from "../session";
import type { SkillInfo } from "../skills";
import type { SnapshotStore } from "../snapshot-store";
import type {
  AgentConfig,
  BeforeTurnResult,
  LoopStepInfo,
  RunnableAgent,
} from "../types";
import type { UsageMeasurement } from "../usage";

// Context passed to defineAgent callbacks and factory functions
export interface DefineAgentContext<TContext = unknown> {
  appName: string;
  context: TContext;
  cwd: string;
  sessionId: string;
}

// History config for defineAgent — CheckpointHistoryOptions minus sessionId
export interface AgentHistoryConfig
  extends Omit<CheckpointHistoryOptions, "sessionId"> {}

// Skills discovery config
export interface AgentSkillsConfig {
  bundledDir?: string;
  globalCommandsDir?: string;
  globalSkillsDir?: string;
  projectCommandsDir?: string;
  projectSkillsDir?: string;
}

// Core agent declaration — what defineAgent() returns
export interface DefinedAgent<TContext = unknown> {
  // Static config OR async factory called once at runtime creation
  agent:
    | AgentConfig
    | ((
        ctx: DefineAgentContext<TContext>
      ) => AgentConfig | Promise<AgentConfig>);
  commands?: Command[];
  description?: string;
  history?: AgentHistoryConfig;
  readonly kind: "defined-agent";
  measureUsage?: (
    messages: ModelMessage[],
    ctx: DefineAgentContext<TContext>
  ) => Promise<UsageMeasurement | null>;
  name: string;
  onBeforeTurn?: (
    params: {
      phase: "new-turn" | "intermediate-step";
      iteration: number;
      messages: ModelMessage[];
    },
    ctx: DefineAgentContext<TContext>
  ) => BeforeTurnResult | undefined | Promise<BeforeTurnResult | undefined>;
  onTurnComplete?: (
    params: {
      finishReason?: string;
      messages: ModelMessage[];
      usage?: UsageMeasurement | null;
      snapshot?: HistorySnapshot;
    },
    ctx: DefineAgentContext<TContext>
  ) => void | Promise<void>;
  skills?: AgentSkillsConfig;
  version?: string;
}

export interface AgentRuntimePersistenceConfig {
  autoSave?: boolean; // default true when snapshotStore exists
  snapshotStore?: SnapshotStore;
}

export interface AgentRuntimeSessionConfig {
  manager?: SessionManager;
  prefix?: string;
}

export interface AgentRuntimeConfig<
  TAgents extends readonly DefinedAgent<unknown>[],
  TContext = unknown,
> {
  agents: TAgents;
  context?: TContext;
  cwd?: string;
  defaultAgent?: TAgents[number]["name"];
  name: string;
  persistence?: AgentRuntimePersistenceConfig;
  session?: AgentRuntimeSessionConfig;
}

export interface AgentSessionState {
  lastFinishReason?: string;
  lastSavedAt?: number;
  revision: number;
  status: "idle" | "running";
}

export interface RunTurnOptions {
  input?: string;
  maxIterations?: number;
  onStepComplete?: (step: LoopStepInfo) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface RunTurnResult {
  finishReason: string;
  iterations: number;
  messages: ModelMessage[];
  usage?: UsageMeasurement | null;
}

export interface ReconfigureOptions<TContext = unknown> {
  agent?:
    | AgentConfig
    | ((
        ctx: DefineAgentContext<TContext>
      ) => AgentConfig | Promise<AgentConfig>);
  history?: AgentHistoryConfig;
}

export interface AgentSession<
  TAgentName extends string = string,
  TContext = unknown,
> {
  addUserMessage(input: string, originalContent?: string): void;
  readonly agentName: TAgentName;
  close(): Promise<void>;
  readonly commands: Command[];
  readonly context: TContext;
  fork(options?: {
    sessionId?: string;
  }): Promise<AgentSession<TAgentName, TContext>>;

  getMessagesForLLM(): ModelMessage[];
  readonly history: CheckpointHistory;
  reconfigure(options: ReconfigureOptions<TContext>): Promise<void>;
  reload(): Promise<void>;
  reset(options?: {
    sessionId?: string;
    clearPersistedSnapshot?: boolean;
  }): Promise<void>;
  runTurn(options?: RunTurnOptions): Promise<RunTurnResult>;
  readonly runtimeAgent: RunnableAgent;
  save(): Promise<void>;
  readonly sessionId: string;
  readonly skills: SkillInfo[];
  readonly state: AgentSessionState;
}

export interface AgentRuntime<
  TAgents extends readonly DefinedAgent<unknown>[],
  TContext = unknown,
> {
  close(): Promise<void>;
  getAgent<TName extends TAgents[number]["name"]>(
    name: TName
  ): Extract<TAgents[number], { name: TName }>;
  getAgentNames(): TAgents[number]["name"][];
  readonly name: string;
  openSession<TName extends TAgents[number]["name"]>(options?: {
    agent?: TName;
    sessionId?: string;
    context?: TContext;
  }): Promise<AgentSession<TName, TContext>>;
  resumeSession<TName extends TAgents[number]["name"]>(options: {
    sessionId: string;
    agent?: TName;
    context?: TContext;
  }): Promise<AgentSession<TName, TContext>>;
}
