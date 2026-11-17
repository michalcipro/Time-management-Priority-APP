import type { Metadata } from "next";
import { requirePermission } from "@/server/session";
import { BoardView } from "@/components/board/board-view";

export const metadata: Metadata = { title: "Priority Board" };

export default async function BoardPage() {
  await requirePermission("board:view");
  return <BoardView />;
}
