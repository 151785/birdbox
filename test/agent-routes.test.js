import test from "node:test";
import assert from "node:assert/strict";
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
