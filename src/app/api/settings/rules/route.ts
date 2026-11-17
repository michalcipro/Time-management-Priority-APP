import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { updatePriorityRules } from "@/server/services/settings";
import { priorityRulesSchema } from "@/lib/settings";
import { reapplyRules } from "@/server/services/escalation";
import { audit } from "@/server/audit";

export const PUT = apiRoute(
  async ({ req, user }) => {
    const rules = await parseJson(req, priorityRulesSchema);
    const settings = await withActor(user, (db) => updatePriorityRules(db, user, rules));
    const recalculated = await reapplyRules(user.teamId);
    await audit({ actor: user, action: "settings.priority_rules.update", metadata: { ...rules, recalculated }, headers: req.headers });
    return { settings, recalculated };
  },
  { permission: "rules:manage" },
);
