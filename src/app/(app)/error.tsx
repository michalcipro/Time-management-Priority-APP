"use client";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-p1-soft text-p1">
        <TriangleAlert className="size-6" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">Něco se pokazilo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Stránku se nepodařilo načíst. Zkuste to prosím znovu.{error.digest ? ` (kód ${error.digest})` : ""}</p>
      </div>
      <Button onClick={reset}>
        <RotateCcw /> Zkusit znovu
      </Button>
    </div>
  );
}
