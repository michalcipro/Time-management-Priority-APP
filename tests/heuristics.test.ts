import { describe, expect, it } from "vitest";
import { extractDeadlines, heuristicAnalysis, summarize } from "@/server/ai/heuristics";
import { dayKey, formatTime } from "@/lib/format";
import { vocative } from "@/lib/czech";

// Tuesday 17 Nov 2026, 10:00 Prague time
const now = new Date("2026-11-17T09:00:00Z");

describe("extractDeadlines (Czech)", () => {
  it("understands relative days and times", () => {
    const [d] = extractDeadlines("Můžeme se sejít zítra ve 12:00?", now);
    expect(dayKey(d.date)).toBe("2026-11-18");
    expect(formatTime(d.date)).toBe("12:00");
    expect(dayKey(extractDeadlines("Potřebuji to dnes", now)[0].date)).toBe("2026-11-17");
  });

  it("resolves weekdays to the next occurrence", () => {
    const [d] = extractDeadlines("Pošlete mi to prosím do pátku.", now);
    expect(dayKey(d.date)).toBe("2026-11-20");
  });

  it("parses explicit dates and rolls past dates into next year", () => {
    expect(dayKey(extractDeadlines("Termín je 30. 11.", now)[0].date)).toBe("2026-11-30");
    expect(dayKey(extractDeadlines("Splatnost 15.1.", now)[0].date)).toBe("2027-01-15");
    expect(dayKey(extractDeadlines("lhůta do 15 dnů", now)[0].date)).toBe("2026-12-02");
  });
});

describe("heuristicAnalysis", () => {
  const team = [
    { id: "jan", name: "Jan", role: "ADVISOR", title: "Senior daňový poradce" },
    { id: "petr", name: "Petr", role: "ADVISOR", title: "Hypoteční specialista" },
    { id: "anna", name: "Anna", role: "ADVISOR", title: "Finanční poradkyně – investice a pojištění" },
  ];

  it("flags an insurance emergency as P1 and routes it to the insurance advisor", () => {
    const a = heuristicAnalysis({ channel: "EMAIL", senderName: "Jana", subject: "Pojistná událost", content: "Dobrý den, v noci nás vytopil soused. Co mám dělat?", receivedAt: now, now, team });
    expect(a.suggestedPriority).toBe(1);
    expect(a.sentiment).toBe("urgent");
    expect(a.tasks[0].suggestedAssigneeId).toBe("anna");
    expect(a.replies.length).toBeGreaterThan(0);
  });

  it("classifies a newsletter as informational P5 without a reply", () => {
    const a = heuristicAnalysis({ channel: "EMAIL", senderName: "Newsletter", subject: "Články", content: "Tento týden jsme pro vás vybrali články. Odhlásit odběr.", receivedAt: now, now });
    expect(a.suggestedPriority).toBe(5);
    expect(a.needsReply).toBe(false);
    expect(a.tasks).toHaveLength(0);
  });

  it("routes a tax question to the tax advisor and a mortgage question to the mortgage specialist", () => {
    const tax = heuristicAnalysis({ channel: "SMS", senderName: "Říha", subject: null, content: "Kolik zaplatím daň z prodeje akcií?", receivedAt: now, now, team });
    expect(tax.topics).toContain("daně");
    expect(tax.tasks[0].suggestedAssigneeId).toBe("jan");
    const mortgage = heuristicAnalysis({ channel: "WHATSAPP", senderName: "Holá", subject: null, content: "Vyplatí se refinancovat hypotéku?", receivedAt: now, now, team });
    expect(mortgage.tasks[0].suggestedAssigneeId).toBe("petr");
  });

  it("raises priority for a meeting tomorrow", () => {
    const a = heuristicAnalysis({ channel: "IMESSAGE", senderName: "Klára", subject: null, content: "Zítra nestihnu schůzku v 10, šlo by to přesunout?", receivedAt: now, now });
    expect(a.suggestedPriority).toBeLessThanOrEqual(2);
    expect(a.intent).toBe("Změna termínu schůzky");
  });
});

describe("summarize", () => {
  it("strips greetings and sign-offs", () => {
    expect(summarize("Dobrý den,\n\nposílám podepsanou smlouvu. Ozvěte se prosím.\n\nS pozdravem\nKarel")).toBe("Posílám podepsanou smlouvu. Ozvěte se prosím.");
  });
});

describe("vocative", () => {
  it("handles common Czech first names", () => {
    expect(["Martin", "Jan", "Petr", "Anna", "Lucie", "Tomáš", "Pavel", "Marek"].map(vocative)).toEqual([
      "Martine",
      "Jane",
      "Petře",
      "Anno",
      "Lucie",
      "Tomáši",
      "Pavle",
      "Marku",
    ]);
  });
});

describe("heuristic deadlines are realistic", () => {
  it("does not treat a past mention of 'dnes' as a deadline", () => {
    expect(extractDeadlines("Dnes mi přišla výzva od banky.", now)).toHaveLength(0);
    expect(dayKey(extractDeadlines("Potřebuji to ještě dnes.", now)[0].date)).toBe("2026-11-17");
  });
  it("suggests a future task deadline for urgent messages in the evening", () => {
    const evening = new Date("2026-11-17T19:00:00Z"); // 20:00 Prague
    const a = heuristicAnalysis({ channel: "SMS", senderName: "Pavla", subject: null, content: "Je to naléhavé, potřebuji pomoct s výzvou banky do pátku.", receivedAt: evening, now: evening });
    expect(a.suggestedPriority).toBeLessThanOrEqual(2);
    expect(Date.parse(a.tasks[0].deadline!)).toBeGreaterThan(evening.getTime());
  });
});
