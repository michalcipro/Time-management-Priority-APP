-- ════════════════════════════════════════════════════════════════════════════
-- RBAC on the database level: PostgreSQL Row-Level Security
--
-- The application sets these transaction-local settings before every query
-- (see src/lib/db.ts → withActor / withSystem):
--   app.user_id     – id of the signed-in user
--   app.team_id     – the user's team (tenant)
--   app.role        – DIRECTOR | ADVISOR | ADMIN
--   app.bypass_rls  – 'on' only for trusted system jobs (sync, escalation, AI)
--
-- Policies are enforced for every role that does not own the tables (the runtime
-- role `priority_app`, see docker/postgres/01-app-role.sql). The API layer applies
-- the same rules (src/lib/rbac.ts), so the database acts as defense in depth.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Helper functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app_setting(name text) RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting(name, true), '') $$;

CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(app_setting('app.bypass_rls') = 'on', false) $$;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT app_setting('app.user_id') $$;

CREATE OR REPLACE FUNCTION app_team_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT app_setting('app.team_id') $$;

CREATE OR REPLACE FUNCTION app_role() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT app_setting('app.role') $$;

-- SECURITY DEFINER helpers run as the table owner, which avoids recursive policy
-- evaluation between Task ⇄ TaskAssignee ⇄ Message.

CREATE OR REPLACE FUNCTION app_can_see_task(p_task_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM "Task" t
      WHERE t.id = p_task_id
        AND t."teamId" = app_team_id()
        AND (
          app_role() = 'DIRECTOR'
          OR t."creatorId" = app_user_id()
          OR EXISTS (
            SELECT 1 FROM "TaskAssignee" ta
            WHERE ta."taskId" = t.id AND ta."userId" = app_user_id()
          )
        )
    )
  $$;

CREATE OR REPLACE FUNCTION app_is_task_assignee(p_task_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM "TaskAssignee" ta
      WHERE ta."taskId" = p_task_id AND ta."userId" = app_user_id()
    )
  $$;

CREATE OR REPLACE FUNCTION app_message_linked_to_my_task(p_message_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM "Task" t
      JOIN "TaskAssignee" ta ON ta."taskId" = t.id
      WHERE t."sourceMessageId" = p_message_id AND ta."userId" = app_user_id()
    )
  $$;

CREATE OR REPLACE FUNCTION app_can_see_message(p_message_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM "Message" m
      WHERE m.id = p_message_id
        AND m."teamId" = app_team_id()
        AND (
          app_role() = 'DIRECTOR'
          OR m."ownerId" = app_user_id()
          OR m."assigneeId" = app_user_id()
          OR app_message_linked_to_my_task(m.id)
        )
    )
  $$;

-- ─── Data integrity ─────────────────────────────────────────────────────────

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_priority_range" CHECK ("priority" BETWEEN 1 AND 5 AND "basePriority" BETWEEN 1 AND 5);
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_priority_range" CHECK ("priority" BETWEEN 1 AND 5 AND "basePriority" BETWEEN 1 AND 5);
ALTER TABLE "PriorityHistory"
  ADD CONSTRAINT "PriorityHistory_priority_range" CHECK ("newPriority" BETWEEN 1 AND 5);

-- ─── Policies ───────────────────────────────────────────────────────────────

-- Messages: director sees the whole team; advisors see their own inbox, messages
-- assigned to them and messages behind tasks assigned to them. Admins (system
-- administration only) do not see client communication.
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_access ON "Message"
  USING (
    app_bypass_rls() OR (
      "teamId" = app_team_id() AND (
        app_role() = 'DIRECTOR'
        OR "ownerId" = app_user_id()
        OR "assigneeId" = app_user_id()
        OR app_message_linked_to_my_task(id)
      )
    )
  )
  WITH CHECK (app_bypass_rls() OR "teamId" = app_team_id());

-- Tasks: director sees all team tasks; others see tasks they created or are assigned to.
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_access ON "Task"
  USING (
    app_bypass_rls() OR (
      "teamId" = app_team_id() AND (
        app_role() = 'DIRECTOR'
        OR "creatorId" = app_user_id()
        OR app_is_task_assignee(id)
      )
    )
  )
  WITH CHECK (app_bypass_rls() OR "teamId" = app_team_id());

ALTER TABLE "TaskAssignee" ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_assignee_access ON "TaskAssignee"
  USING (app_bypass_rls() OR "userId" = app_user_id() OR app_can_see_task("taskId"))
  WITH CHECK (app_bypass_rls() OR app_can_see_task("taskId"));

ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY comment_access ON "Comment"
  USING (app_bypass_rls() OR ("teamId" = app_team_id() AND app_can_see_task("taskId")))
  WITH CHECK (
    app_bypass_rls() OR (
      "teamId" = app_team_id() AND app_can_see_task("taskId") AND "authorId" = app_user_id()
    )
  );

ALTER TABLE "PriorityHistory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY priority_history_access ON "PriorityHistory"
  USING (
    app_bypass_rls() OR (
      "teamId" = app_team_id() AND (
        app_role() = 'DIRECTOR'
        OR ("taskId" IS NOT NULL AND app_can_see_task("taskId"))
        OR ("messageId" IS NOT NULL AND app_can_see_message("messageId"))
      )
    )
  )
  WITH CHECK (app_bypass_rls() OR "teamId" = app_team_id());

-- Personal data: only the owner (notifications, push subscriptions, briefings, AI chat).
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_access ON "Notification"
  USING (app_bypass_rls() OR "userId" = app_user_id())
  WITH CHECK (app_bypass_rls() OR "userId" = app_user_id());

ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscription_access ON "PushSubscription"
  USING (app_bypass_rls() OR "userId" = app_user_id())
  WITH CHECK (app_bypass_rls() OR "userId" = app_user_id());

ALTER TABLE "Briefing" ENABLE ROW LEVEL SECURITY;
CREATE POLICY briefing_access ON "Briefing"
  USING (app_bypass_rls() OR "userId" = app_user_id())
  WITH CHECK (app_bypass_rls() OR "userId" = app_user_id());

ALTER TABLE "AssistantMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistant_message_access ON "AssistantMessage"
  USING (app_bypass_rls() OR "userId" = app_user_id())
  WITH CHECK (app_bypass_rls() OR "userId" = app_user_id());

-- Calendar: own events; the director sees the team calendar.
ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_event_access ON "CalendarEvent"
  USING (
    app_bypass_rls() OR (
      "teamId" = app_team_id() AND ("userId" = app_user_id() OR app_role() = 'DIRECTOR')
    )
  )
  WITH CHECK (app_bypass_rls() OR ("teamId" = app_team_id() AND "userId" = app_user_id()));

-- Integrations: own connections; director/admin manage team integrations.
ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_access ON "Integration"
  USING (
    app_bypass_rls() OR (
      "teamId" = app_team_id() AND (
        "userId" = app_user_id() OR app_role() IN ('DIRECTOR', 'ADMIN')
      )
    )
  )
  WITH CHECK (
    app_bypass_rls() OR (
      "teamId" = app_team_id() AND (
        "userId" = app_user_id() OR app_role() IN ('DIRECTOR', 'ADMIN')
      )
    )
  );

-- Operational logs: director and admin; users see their own AI usage.
ALTER TABLE "AILog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_log_access ON "AILog"
  USING (
    app_bypass_rls() OR (
      "teamId" = app_team_id() AND (app_role() IN ('DIRECTOR', 'ADMIN') OR "userId" = app_user_id())
    )
  )
  WITH CHECK (app_bypass_rls());

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_access ON "AuditLog"
  USING (app_bypass_rls() OR ("teamId" = app_team_id() AND app_role() IN ('DIRECTOR', 'ADMIN')))
  WITH CHECK (app_bypass_rls());
