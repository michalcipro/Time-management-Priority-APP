import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, decryptJson, encrypt, encryptJson, sha256, safeEqual } from "@/server/crypto";
import { buildSearchText, normalizeForSearch, searchTerms } from "@/lib/search-text";
import { parseNotificationPrefs, parseTeamSettings, priorityRulesSchema, estimateCostUsd } from "@/lib/settings";
import { deadlineInfo, fromLocalDateTime, dayKey, formatTime } from "@/lib/format";
import { inQuietHours } from "@/server/notifications";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("AES-256-GCM credentials encryption", () => {
  it("round-trips and uses a random IV", () => {
    const a = encrypt("tajný token");
    const b = encrypt("tajný token");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("tajný token");
    expect(decryptJson<{ t: number }>(encryptJson({ t: 1 }))).toEqual({ t: 1 });
  });

  it("detects tampering", () => {
    const parts = encrypt("data").split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
    expect(decryptJson(parts.join("."))).toBeNull();
  });

  it("hashes and compares safely", () => {
    expect(sha256("abc")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("diacritics-insensitive search", () => {
  it("normalises text and query terms", () => {
    expect(normalizeForSearch("  Karel NOVÁK – Hypotéka ")).toBe("karel novak – hypoteka");
    expect(buildSearchText("Říha", ["daně", "akcie"])).toBe("riha dane akcie");
    expect(searchTerms("novák  %_ a hypotéka")).toEqual(["novak", "hypoteka"]);
  });
});

describe("settings schemas", () => {
  it("fills defaults for empty JSON", () => {
    const s = parseTeamSettings({});
    expect(s.priorityRules.p1Hours).toBe(24);
    expect(s.ai.analysisModel).toBe("claude-haiku-5-5");
    const prefs = parseNotificationPrefs(null);
    expect(prefs.events.taskAssigned).toBe(true);
    expect(prefs.quietStart).toBe("20:00");
  });

  it("rejects non-ascending thresholds", () => {
    expect(priorityRulesSchema.safeParse({ p1Hours: 48, p2Hours: 24, p3Hours: 168, p4Hours: 336 }).success).toBe(false);
  });

  it("estimates AI cost per model", () => {
    expect(estimateCostUsd("claude-haiku-5-5", 1_000_000, 0)).toBeCloseTo(0.1);
    expect(estimateCostUsd("claude-opus-5-5", 0, 1_000_000)).toBeCloseTo(20);
  });
});

describe("timezone-aware formatting (Europe/Prague)", () => {
  it("converts local wall time across DST", () => {
    expect(fromLocalDateTime("2026-07-01T12:00")!.toISOString()).toBe("2026-07-01T10:00:00.000Z"); // CEST
    expect(fromLocalDateTime("2026-12-01T12:00")!.toISOString()).toBe("2026-12-01T11:00:00.000Z"); // CET
    expect(dayKey(new Date("2026-11-17T23:30:00Z"))).toBe("2026-11-18");
    expect(formatTime(new Date("2026-11-17T11:00:00Z"))).toBe("12:00");
  });

  it("labels deadlines", () => {
    const now = new Date("2026-11-17T08:00:00Z");
    expect(deadlineInfo(new Date("2026-11-17T11:00:00Z"), now)).toMatchObject({ label: "Dnes 12:00", tone: "today" });
    expect(deadlineInfo(new Date("2026-11-18T11:00:00Z"), now).label).toBe("Zítra 12:00");
    expect(deadlineInfo(new Date("2026-11-16T11:00:00Z"), now).tone).toBe("overdue");
    expect(deadlineInfo(new Date("2026-11-27T11:00:00Z"), now).remaining).toBe("Zbývá 10 dní");
  });
});

describe("quiet hours", () => {
  const prefs = parseNotificationPrefs({ quietHoursEnabled: true, quietStart: "20:00", quietEnd: "07:00" });
  it("handles windows across midnight", () => {
    expect(inQuietHours(new Date("2026-11-17T21:30:00Z"), prefs)).toBe(true); // 22:30 Prague
    expect(inQuietHours(new Date("2026-11-17T05:00:00Z"), prefs)).toBe(true); // 06:00
    expect(inQuietHours(new Date("2026-11-17T09:00:00Z"), prefs)).toBe(false); // 10:00
    expect(inQuietHours(new Date("2026-11-17T21:30:00Z"), { ...prefs, quietHoursEnabled: false })).toBe(false);
  });
});
