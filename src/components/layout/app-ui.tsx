"use client";
import { createContext, Suspense, useCallback, useContext, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TaskFormDialog, type TaskFormPrefill } from "@/components/tasks/task-form-dialog";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import type { MessageDetail } from "@/lib/dto";
import { CommandPalette } from "./command-palette";

interface AppUI {
  openCreateTask: (prefill?: TaskFormPrefill) => void;
  openAssign: (message: MessageDetail) => void;
  openTask: (taskId: string) => void;
  openCommand: () => void;
}

const AppUIContext = createContext<AppUI | null>(null);

export function useAppUI(): AppUI {
  const ctx = useContext(AppUIContext);
  if (!ctx) throw new Error("useAppUI must be used inside <AppUIProvider>");
  return ctx;
}

/** Task detail drawer bound to the `?task=` search parameter (deep-linkable). */
function TaskSheetFromUrl() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const taskId = params.get("task");
  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("task");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return <TaskDetailSheet taskId={taskId} onClose={close} />;
}

export function AppUIProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState<TaskFormPrefill | undefined>();
  const [assignMessage, setAssignMessage] = useState<MessageDetail | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  const openTask = useCallback(
    (taskId: string) => {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      params.set("task", taskId);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  const value = useMemo<AppUI>(
    () => ({
      openCreateTask: (p) => {
        setPrefill(p);
        setCreateOpen(true);
      },
      openAssign: (m) => setAssignMessage(m),
      openTask,
      openCommand: () => setCommandOpen(true),
    }),
    [openTask],
  );

  return (
    <AppUIContext.Provider value={value}>
      {children}
      <TaskFormDialog open={createOpen} onOpenChange={setCreateOpen} prefill={prefill} onDone={(id) => openTask(id)} />
      <TaskFormDialog open={Boolean(assignMessage)} onOpenChange={(o) => !o && setAssignMessage(null)} message={assignMessage} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <Suspense fallback={null}>
        <TaskSheetFromUrl />
      </Suspense>
    </AppUIContext.Provider>
  );
}
