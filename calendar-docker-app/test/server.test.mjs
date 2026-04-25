import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp } from "../src/server.mjs";

async function startTestServer() {
  const directory = await mkdtemp(path.join(tmpdir(), "calendar-http-"));
  const app = createApp({ dataDir: directory });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(directory, { force: true, recursive: true });
    }
  };
}

test("serves health and calendar events over HTTP", async () => {
  const server = await startTestServer();
  try {
    const health = await fetch(`${server.baseUrl}/api/health`).then((response) => response.json());
    const events = await fetch(`${server.baseUrl}/api/events`).then((response) => response.json());

    assert.equal(health.status, "ok");
    assert.ok(Array.isArray(events));
    assert.ok(events.length > 0);
  } finally {
    await server.close();
  }
});

test("serves the WebUI entry page", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(html, /Docker WebUI Calendar/);
    assert.match(html, /\/api\/events/);
  } finally {
    await server.close();
  }
});

test("creates, updates, and deletes an event over HTTP", async () => {
  const server = await startTestServer();
  try {
    const createdResponse = await fetch(`${server.baseUrl}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Docker 演示",
        date: "2025-07-26",
        start: "10:00",
        end: "11:00",
        calendar: "工作",
        color: "#2f6df6",
        location: "WebUI",
        participants: "产品团队",
        description: "验证容器化日历可以直接使用。"
      })
    });
    const created = await createdResponse.json();

    const updatedResponse = await fetch(`${server.baseUrl}/api/events/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Docker 演示与验收" })
    });
    const updated = await updatedResponse.json();

    const deletedResponse = await fetch(`${server.baseUrl}/api/events/${created.id}`, {
      method: "DELETE"
    });

    assert.equal(createdResponse.status, 201);
    assert.equal(updated.title, "Docker 演示与验收");
    assert.equal(deletedResponse.status, 204);
  } finally {
    await server.close();
  }
});
