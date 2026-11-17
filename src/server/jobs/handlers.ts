import "server-only";
import type { JobName, JobPayloads } from "./types";

/** Job implementations (shared by the BullMQ worker, inline runner and cron endpoints). */
export async function runJob<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<unknown> {
  switch (name) {
    case "message.analyze": {
      const { analyzeMessage } = await import("../ai/analyze-message");
      const p = payload as JobPayloads["message.analyze"];
      return analyzeMessage(p.messageId, { force: p.force });
    }
    case "notification.deliver": {
      const { deliverNotification } = await import("../notifications");
      return deliverNotification((payload as JobPayloads["notification.deliver"]).notificationId);
    }
    case "integration.sync": {
      const { syncIntegration } = await import("../integrations/sync");
      return syncIntegration((payload as JobPayloads["integration.sync"]).integrationId);
    }
    case "channels.sync": {
      const { syncAllChannels } = await import("../integrations/sync");
      return syncAllChannels();
    }
    case "priorities.recalculate": {
      const { recalculatePriorities } = await import("../services/escalation");
      return recalculatePriorities();
    }
    case "briefings.generate": {
      const { generateDueBriefings } = await import("../ai/briefing");
      return { generated: await generateDueBriefings() };
    }
    case "notifications.flush": {
      const { flushDeferredNotifications } = await import("../notifications");
      return { delivered: await flushDeferredNotifications() };
    }
    default:
      throw new Error(`Unknown job: ${String(name)}`);
  }
}
