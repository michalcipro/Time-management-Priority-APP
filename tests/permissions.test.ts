import { describe, expect, it } from "vitest";
import { can, homePathFor } from "@/lib/permissions";

describe("RBAC permission matrix", () => {
  it("director has full access to communication and team", () => {
    for (const p of ["messages:read:all", "tasks:assign", "team:view", "rules:manage", "privacy:erase-contact"] as const) {
      expect(can("DIRECTOR", p)).toBe(true);
    }
  });

  it("advisor only works with own tasks", () => {
    expect(can("ADVISOR", "tasks:create")).toBe(true);
    expect(can("ADVISOR", "priority:override")).toBe(true);
    expect(can("ADVISOR", "messages:read:all")).toBe(false);
    expect(can("ADVISOR", "tasks:assign")).toBe(false);
    expect(can("ADVISOR", "team:view")).toBe(false);
    expect(can("ADVISOR", "users:manage")).toBe(false);
  });

  it("admin manages the system but cannot read client communication", () => {
    expect(can("ADMIN", "users:manage")).toBe(true);
    expect(can("ADMIN", "integrations:manage:team")).toBe(true);
    expect(can("ADMIN", "audit:view")).toBe(true);
    expect(can("ADMIN", "messages:read:all")).toBe(false);
    expect(can("ADMIN", "messages:reply")).toBe(false);
    expect(can("ADMIN", "tasks:read:all")).toBe(false);
  });

  it("routes each role to its home page", () => {
    expect(homePathFor("DIRECTOR")).toBe("/board");
    expect(homePathFor("ADVISOR")).toBe("/my-tasks");
    expect(homePathFor("ADMIN")).toBe("/settings/users");
    expect(can(null, "tasks:create")).toBe(false);
  });
});
