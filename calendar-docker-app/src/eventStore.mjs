import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_EVENTS } from "./defaultEvents.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export { DEFAULT_EVENTS };

export function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function cleanString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

export function validateEventInput(input, existing = {}) {
  const event = {
    ...existing,
    ...input
  };

  const title = cleanString(event.title);
  const date = cleanString(event.date);
  const start = cleanString(event.start);
  const end = cleanString(event.end);
  const calendar = cleanString(event.calendar, "个人");
  const color = cleanString(event.color, "#2f6df6");
  const location = cleanString(event.location, "未设置地点");
  const participants = cleanString(event.participants, "个人");
  const description = cleanString(event.description, "暂无描述。");

  if (!title) throw new Error("标题不能为空");
  if (!DATE_PATTERN.test(date)) throw new Error("日期格式必须为 YYYY-MM-DD");
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) throw new Error("时间格式必须为 HH:mm");
  if (minutesFromTime(end) <= minutesFromTime(start)) throw new Error("结束时间必须晚于开始时间");
  if (!COLOR_PATTERN.test(color)) throw new Error("颜色必须是 #RRGGBB 格式");

  return {
    id: existing.id || cleanString(event.id) || randomUUID(),
    title,
    date,
    start,
    end,
    calendar,
    color,
    location,
    participants,
    description,
    updatedAt: new Date().toISOString()
  };
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) return byDate;
    return minutesFromTime(left.start) - minutesFromTime(right.start);
  });
}

export function createEventStore({ dataDir = process.env.DATA_DIR || "/data" } = {}) {
  const filePath = path.join(dataDir, "events.json");

  async function ensureFile() {
    await mkdir(dataDir, { recursive: true });
    try {
      await readFile(filePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const seeded = DEFAULT_EVENTS.map((event) => validateEventInput(event, { id: event.id }));
      await writeJson(seeded);
    }
  }

  async function readJson() {
    await ensureFile();
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error("events.json 必须包含事件数组");
    return parsed.map((event) => validateEventInput(event, { id: event.id, updatedAt: event.updatedAt }));
  }

  async function writeJson(events) {
    await mkdir(dataDir, { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(sortEvents(events), null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  }

  return {
    async listEvents() {
      return sortEvents(await readJson());
    },

    async createEvent(input) {
      const events = await readJson();
      const event = validateEventInput(input);
      events.push(event);
      await writeJson(events);
      return event;
    },

    async updateEvent(id, input) {
      const events = await readJson();
      const index = events.findIndex((event) => event.id === id);
      if (index === -1) return null;

      const updated = validateEventInput(input, events[index]);
      events[index] = updated;
      await writeJson(events);
      return updated;
    },

    async deleteEvent(id) {
      const events = await readJson();
      const nextEvents = events.filter((event) => event.id !== id);
      if (nextEvents.length === events.length) return false;
      await writeJson(nextEvents);
      return true;
    }
  };
}
