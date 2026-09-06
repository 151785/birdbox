import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";

import { AgentBroker } from "../src/agent-broker.js";
import { MemoryDatabase } from "../src/database.js";
import { agentRoutes } from "../src/http/agent-routes.js";

test("Agent HTTP polling API authenticates and returns queued tasks", async () => {
  const broker = new AgentBroker({ database: new MemoryDatabase() });
  await broker.initialize();
  const token = await broker.issueToken("route_agent");
  const app = Fastify();
  await app.register(agentRoutes, { broker });
  const register = await app.inject({ method: "POST", url: "/api/agent/register", payload: { nodeId: "route_agent", token, agentVersion: "test", protocolVersion: 1 } });
  assert.equal(register.statusCode, 200);
  const pending = broker.dispatch("route_agent", "system.info", {}, 2000);
  const poll = await app.inject({ method: "POST", url: "/api/agent/tasks/poll", headers: { authorization: `Bearer ${token}` }, payload: { nodeId: "route_agent" } });
  assert.equal(poll.statusCode, 200);
  const task = poll.json().task;
  assert.equal(task.method, "system.info");
  const result = await app.inject({ method: "POST", url: `/api/agent/tasks/${task.taskId}/result`, headers: { authorization: `Bearer ${token}` }, payload: { nodeId: "route_agent", ok: true, stdout: "", stderr: "", result: { ok: true } } });
  assert.equal(result.statusCode, 200);
  assert.equal((await pending).ok, true);
  await app.close();
});

test("Agent release download accepts the mipsle spelling used by setup scripts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "birdbox-agent-route-"));
  try {
    await writeFile(path.join(directory, "birdbox-agent-mipsle"), "agent-mipsle");
    const app = Fastify();
    await app.register(agentRoutes, { broker: new AgentBroker({ database: new MemoryDatabase() }), binaryPath: directory });
    for (const arch of ["mipsle", "mipsel"]) {
      const response = await app.inject({ method: "GET", url: `/api/agent/releases/latest/download?arch=${arch}` });
      assert.equal(response.statusCode, 200);
      assert.equal(response.body, "agent-mipsle");
    }
    await app.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
