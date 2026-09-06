import test from "node:test";
import assert from "node:assert/strict";

import { AgentBroker } from "../src/agent-broker.js";
import { MemoryDatabase } from "../src/database.js";

test("Agent broker registers, delivers and resolves a task", async () => {
  const broker = new AgentBroker({ database: new MemoryDatabase() });
  await broker.initialize();
  const token = await broker.issueToken("agent_one");
  await broker.register({ nodeId: "agent_one", token, agentVersion: "test", protocolVersion: 1 });
  const resultPromise = broker.dispatch("agent_one", "legacy.exec", { command: "true" }, 2000);
  const task = await broker.poll("agent_one", token, 1000);
  assert.equal(task?.method, "legacy.exec");
  broker.result({ taskId: task.taskId, nodeId: "agent_one", ok: true, stdout: "ok", stderr: "" }, token);
  assert.equal((await resultPromise).stdout, "ok");
});

test("Agent broker rejects revoked credentials", async () => {
  const broker = new AgentBroker({ database: new MemoryDatabase() });
  await broker.initialize();
  const token = await broker.issueToken("agent_two");
  await broker.revoke("agent_two");
  await assert.rejects(() => broker.register({ nodeId: "agent_two", token, agentVersion: "test", protocolVersion: 1 }), /凭据无效/);
});

test("Agent broker accepts structured source-policy rule tasks", async () => {
  const broker = new AgentBroker({ database: new MemoryDatabase() });
  await broker.initialize();
  const token = await broker.issueToken("route_agent");
  await broker.register({ nodeId: "route_agent", token, agentVersion: "test", protocolVersion: 1, capabilities: ["network.ip_rules"] });
  const pending = broker.dispatch("route_agent", "network.ip_rules", {
    removeRules: [],
    rules: [{ priority: 10000, source: "192.0.2.0/24", table: 200 }],
  }, 2000);
  const task = await broker.poll("route_agent", token, 1000);
  assert.equal(task?.method, "network.ip_rules");
  broker.result({ taskId: task.taskId, nodeId: task.nodeId, ok: true, stdout: "", stderr: "" }, token);
  assert.equal((await pending).ok, true);
});
