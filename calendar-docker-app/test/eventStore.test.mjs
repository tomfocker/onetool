import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createEventStore,
  DEFAULT_EVENTS,
  validateEventInput
} from "../src/eventStore.mjs";

async function withStore(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "calendar-store-"));
  try {
    const store = createEventStore({ dataDir: directory });
    await run(store);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test("seeds default calendar events when the data file is missing", async () => {
  await withStore(async (store) => {
    const events = await store.listEvents();

    assert.equal(events.length, DEFAULT_EVENTS.length);
    assert.ok(events.some((event) => event.title === "团队会议"));
    assert.ok(events.every((event) => event.id));
  });
});

test("creates an event and persists it across store instances", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "calendar-persist-"));
  try {
    const firstStore = createEventStore({ dataDir: directory });
    const created = await firstStore.createEvent({
      title: "晨间复盘",
      date: "2025-07-24",
      start: "08:30",
      end: "09:15",
      calendar: "个人",
      color: "#2f6df6",
      location: "露台",
      participants: "自己",
      description: "整理昨天的交付和今天的重点。"
    });

    const secondStore = createEventStore({ dataDir: directory });
    const reloaded = await secondStore.listEvents();

    assert.ok(created.id);
    assert.ok(reloaded.some((event) => event.id === created.id));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("updates and deletes events", async () => {
  await withStore(async (store) => {
    const created = await store.createEvent({
      title: "客户回访",
      date: "2025-07-25",
      start: "15:30",
      end: "16:00",
      calendar: "工作",
      color: "#38a9bd",
      location: "远程会议",
      participants: "客户代表",
      description: "确认上线前的最后反馈。"
    });

    const updated = await store.updateEvent(created.id, {
      title: "客户回访与风险确认",
      end: "16:15"
    });
    const removed = await store.deleteEvent(created.id);
    const events = await store.listEvents();

    assert.equal(updated.title, "客户回访与风险确认");
    assert.equal(updated.end, "16:15");
    assert.equal(removed, true);
    assert.ok(!events.some((event) => event.id === created.id));
  });
});

test("rejects invalid time ranges", () => {
  assert.throws(
    () => validateEventInput({
      title: "错误时间",
      date: "2025-07-25",
      start: "11:00",
      end: "10:30"
    }),
    /结束时间必须晚于开始时间/
  );
});
