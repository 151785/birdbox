import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type { StateDatabase } from "./database.js";
import { AGENT_METHODS, AGENT_PROTOCOL_VERSION, type AgentRegistration, type AgentTask, type AgentTaskResult } from "./agent-protocol.js";
import { logger } from "./logger.js";

export interface AgentBrokerOptions {
  database: StateDatabase;
  makeId?: (prefix: string) => string;
  onEvent?: (level: string, message: string, nodeId?: string | null) => void;
}

interface CredentialRecord { nodeId: string; tokenHash: string; createdAt: string; revokedAt: string | null; }
interface AgentState {
  nodeId: string;
  connected: boolean;
  registeredAt: string;
  lastSeenAt: string;
  agentVersion: string;
  protocolVersion: number;
  capabilities: string[];
  platform: string | null;
  architecture: string | null;
  hostname: string | null;
}
interface PendingTask { task: AgentTask; resolve: (result: AgentTaskResult) => void; timer: NodeJS.Timeout; }

const CREDENTIALS_KEY = "agent_credentials";
const MAX_TASKS_PER_NODE = 32;
const MAX_TASK_PARAMETER_BYTES = 16 * 1024 * 1024;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class AgentBroker {
  readonly #database: StateDatabase;
  readonly #makeId: (prefix: string) => string;
  readonly #onEvent: (level: string, message: string, nodeId?: string | null) => void;
  readonly #credentials = new Map<string, CredentialRecord>();
  readonly #agents = new Map<string, AgentState>();
  readonly #queues = new Map<string, AgentTask[]>();
  readonly #waiters = new Map<string, Array<(task: AgentTask | null) => void>>();
  readonly #pending = new Map<string, PendingTask>();

  constructor(options: AgentBrokerOptions) {
    this.#database = options.database;
    this.#makeId = options.makeId ?? ((prefix) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`);
    this.#onEvent = options.onEvent ?? (() => undefined);
  }

  async initialize(): Promise<void> {
    const state = await this.#database.readState<CredentialRecord[]>(CREDENTIALS_KEY);
    const records = Array.isArray(state?.value) ? state.value : [];
    for (const record of records) {
      if (record && typeof record.nodeId === "string" && typeof record.tokenHash === "string") this.#credentials.set(record.nodeId, record);
    }
    if (!state) await this.#database.createState(CREDENTIALS_KEY, []);
  }

  async #persistCredentials(): Promise<void> {
    await this.#database.mutateState<CredentialRecord[], null>(CREDENTIALS_KEY, [], (current) => ({
      value: [...this.#credentials.values()].map((item) => ({ ...item })),
      result: null,
    }));
  }

  async issueToken(nodeId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const record: CredentialRecord = { nodeId, tokenHash: hashToken(token), createdAt: new Date().toISOString(), revokedAt: null };
    this.#credentials.set(nodeId, record);
    await this.#persistCredentials();
    return token;
  }

  hasCredential(nodeId: string): boolean { return Boolean(this.#credentials.get(nodeId)?.revokedAt === null); }

  async rotateToken(nodeId: string): Promise<string> { return this.issueToken(nodeId); }

  async revoke(nodeId: string): Promise<void> {
    const record = this.#credentials.get(nodeId);
    if (!record) return;
    record.revokedAt = new Date().toISOString();
    await this.#persistCredentials();
    this.#agents.delete(nodeId);
    logger.info("已撤销 Agent 凭据", { nodeId });
  }

  authenticate(nodeId: string, token: string): boolean {
    if (!nodeId || typeof token !== "string" || token.length < 20) return false;
    const record = this.#credentials.get(nodeId);
    return Boolean(record && !record.revokedAt && sameHash(record.tokenHash, hashToken(token)));
  }

  async register(input: AgentRegistration): Promise<{ heartbeatIntervalSeconds: number; protocolVersion: number }> {
    if (!this.authenticate(input.nodeId, input.token)) throw new Error("Agent 凭据无效或已撤销");
    if (input.protocolVersion !== AGENT_PROTOCOL_VERSION) throw new Error("Agent 协议版本不兼容");
    const now = new Date().toISOString();
    const previous = this.#agents.get(input.nodeId);
    this.#agents.set(input.nodeId, {
      nodeId: input.nodeId,
      connected: true,
      registeredAt: previous?.registeredAt ?? now,
      lastSeenAt: now,
      agentVersion: String(input.agentVersion || "unknown").slice(0, 80),
      protocolVersion: input.protocolVersion,
      capabilities: Array.isArray(input.capabilities) ? input.capabilities.map(String).slice(0, 100) : [],
      platform: input.platform ? String(input.platform).slice(0, 80) : null,
      architecture: input.architecture ? String(input.architecture).slice(0, 80) : null,
      hostname: input.hostname ? String(input.hostname).slice(0, 255) : null,
    });
    if (!previous || previous.agentVersion !== String(input.agentVersion || "unknown").slice(0, 80)) {
      logger.info("Agent 已注册", { nodeId: input.nodeId, version: String(input.agentVersion || "unknown").slice(0, 80) });
      this.#onEvent("success", `Agent ${input.nodeId} 已注册`, input.nodeId);
    }
    return { heartbeatIntervalSeconds: 15, protocolVersion: AGENT_PROTOCOL_VERSION };
  }

  heartbeat(nodeId: string, token: string): void {
    if (!this.authenticate(nodeId, token)) throw new Error("Agent 凭据无效或已撤销");
    const state = this.#agents.get(nodeId);
    if (state) { state.connected = true; state.lastSeenAt = new Date().toISOString(); }
  }

  status(nodeId: string): AgentState | null {
    const item = this.#agents.get(nodeId);
    if (!item) return null;
    const connected = Date.now() - Date.parse(item.lastSeenAt) < 45_000;
    return { ...item, connected, capabilities: [...item.capabilities] };
  }
  statuses(): AgentState[] { return [...this.#agents.keys()].map((nodeId) => this.status(nodeId)!).filter(Boolean); }

  #takeTask(nodeId: string): AgentTask | null {
    const queue = this.#queues.get(nodeId);
    const task = queue?.shift() ?? null;
    if (queue && queue.length === 0) this.#queues.delete(nodeId);
    return task;
  }

  async poll(nodeId: string, token: string, waitMs = 25_000): Promise<AgentTask | null> {
    if (!this.authenticate(nodeId, token)) throw new Error("Agent 凭据无效或已撤销");
    this.heartbeat(nodeId, token);
    const immediate = this.#takeTask(nodeId);
    if (immediate) return immediate;
    return new Promise((resolve) => {
      const waiters = this.#waiters.get(nodeId) ?? [];
      waiters.push(resolve);
      this.#waiters.set(nodeId, waiters);
      const timer = setTimeout(() => {
        const current = this.#waiters.get(nodeId) ?? [];
        const index = current.indexOf(resolve);
        if (index >= 0) current.splice(index, 1);
        if (current.length) this.#waiters.set(nodeId, current); else this.#waiters.delete(nodeId);
        resolve(null);
      }, Math.max(1000, Math.min(waitMs, 30_000)));
      timer.unref();
    });
  }

  dispatch(nodeId: string, method: string, params: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<AgentTaskResult> {
    if (!AGENT_METHODS.has(method)) {
      logger.warn("拒绝未知 Agent 方法", { nodeId, method });
      return Promise.resolve({ taskId: "", nodeId, ok: false, stdout: "", stderr: `不支持的 Agent 方法：${method}`, code: "METHOD_NOT_ALLOWED" });
    }
    let serializedParams: string;
    try { serializedParams = JSON.stringify(params); } catch { return Promise.resolve({ taskId: "", nodeId, ok: false, stdout: "", stderr: "Agent 任务参数不可序列化", code: "INVALID_TASK" }); }
    if (Buffer.byteLength(serializedParams, "utf8") > MAX_TASK_PARAMETER_BYTES) {
      logger.warn("拒绝过大的 Agent 任务参数", { nodeId, method });
      return Promise.resolve({ taskId: "", nodeId, ok: false, stdout: "", stderr: "Agent 任务参数过大", code: "TASK_TOO_LARGE" });
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10 * 60 * 1000) {
      logger.warn("拒绝不合法的 Agent 任务超时设置", { nodeId, method, timeoutMs });
      return Promise.resolve({ taskId: "", nodeId, ok: false, stdout: "", stderr: "Agent 任务超时设置不合法", code: "INVALID_TIMEOUT" });
    }
    const queue = this.#queues.get(nodeId) ?? [];
    const pendingForNode = [...this.#pending.values()].filter((item) => item.task.nodeId === nodeId).length;
    if (queue.length + pendingForNode >= MAX_TASKS_PER_NODE) {
      logger.warn("Agent 任务队列已满", { nodeId, method, queued: queue.length, pending: pendingForNode });
      return Promise.resolve({ taskId: "", nodeId, ok: false, stdout: "", stderr: "Agent 任务队列已满", code: "TASK_QUEUE_FULL" });
    }
    const now = Date.now();
    const task: AgentTask = { taskId: this.#makeId("agent_task"), nodeId, method, params, createdAt: new Date(now).toISOString(), deadlineAt: new Date(now + timeoutMs).toISOString() };
    const waiter = this.#waiters.get(nodeId)?.shift();
    if (waiter) {
      if (!this.#waiters.get(nodeId)?.length) this.#waiters.delete(nodeId);
      waiter(task);
    } else {
      queue.push(task); this.#queues.set(nodeId, queue);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(task.taskId);
        logger.warn("Agent 任务超时", { nodeId, method, taskId: task.taskId, timeoutMs });
        resolve({ taskId: task.taskId, nodeId, ok: false, stdout: "", stderr: "Agent 任务超时", code: "AGENT_TIMEOUT" });
      }, timeoutMs);
      timer.unref(); this.#pending.set(task.taskId, { task, resolve, timer });
    });
  }

  result(input: AgentTaskResult, token: string): void {
    if (!this.authenticate(input.nodeId, token)) throw new Error("Agent 凭据无效或已撤销");
    const pending = this.#pending.get(input.taskId);
    if (!pending || pending.task.nodeId !== input.nodeId) return;
    clearTimeout(pending.timer); this.#pending.delete(input.taskId);
    logger.info("收到 Agent 任务结果", { nodeId: input.nodeId, taskId: input.taskId, ok: input.ok, code: input.code === undefined ? null : String(input.code) });
    pending.resolve({ ...input, stdout: String(input.stdout ?? "").slice(0, 8 * 1024 * 1024), stderr: String(input.stderr ?? "").slice(0, 8 * 1024 * 1024) });
  }
}
