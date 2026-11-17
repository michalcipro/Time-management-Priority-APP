import "server-only";
import type { SearchResults } from "@/lib/dto";
import type { Db } from "../db";
import type { SessionUser } from "../session";
import { listMessages } from "./messages";
import { listTasks } from "./tasks";

/** Global search (command palette) across messages and tasks the user can see. */
export async function globalSearch(db: Db, user: SessionUser, q: string): Promise<SearchResults> {
  if (q.trim().length < 2) return { messages: [], tasks: [] };
  if (user.role === "ADMIN") return { messages: [], tasks: [] };
  const messages = await listMessages(db, user, { view: "all", channel: "ALL", q, sort: "newest", limit: 8 });
  const tasks = await listTasks(db, user, { scope: user.role === "DIRECTOR" ? "all" : "mine", status: "all", q, sort: "priority", limit: 8 });
  return { messages: messages.items, tasks };
}
