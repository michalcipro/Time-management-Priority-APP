"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Copy, Send, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReply } from "@/hooks/queries";
import { api, errorMessage } from "@/lib/api-client";
import type { MessageDetail } from "@/lib/dto";

export interface ReplyComposerHandle {
  insert: (text: string) => void;
  focus: () => void;
}

const QUICK = ["Formálněji", "Stručněji", "Přátelštěji", "Zdvořile odmítnout", "Navrhnout schůzku"];

export const ReplyComposer = forwardRef<ReplyComposerHandle, { message: MessageDetail }>(function ReplyComposer({ message }, ref) {
  const [text, setText] = useState("");
  const [resolve, setResolve] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [drafting, setDrafting] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const reply = useReply();

  useImperativeHandle(ref, () => ({
    insert: (t) => {
      setText(t);
      requestAnimationFrame(() => {
        area.current?.focus();
        area.current?.setSelectionRange(t.length, t.length);
      });
    },
    focus: () => area.current?.focus(),
  }));

  const manual = !message.reply.canSend;

  async function aiDraft(instr?: string) {
    setDrafting(true);
    try {
      const res = await api.post<{ text: string; model: string; warning?: string }>(`/api/messages/${message.id}/draft`, { instruction: instr || instruction || undefined, draft: text || undefined });
      setText(res.text);
      if (res.warning) toast.warning(res.warning);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    if (manual) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* clipboard may be unavailable */
      }
    }
    reply.mutate(
      { id: message.id, text, resolve },
      {
        onSuccess: (res) => {
          setText("");
          if (res.manual) toast.success("Odpověď uložena a zkopírována", { description: "Vložte ji do telefonu nebo e-mailového klienta." });
          else toast.success(`Odesláno přes ${res.sentVia}`);
        },
      },
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-card focus-within:border-ring/50 focus-within:ring-[3px] focus-within:ring-ring/15">
      <Textarea
        ref={area}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={`Napište odpověď pro ${message.senderName ?? message.senderContact}…`}
        className="min-h-28 resize-y border-0 bg-transparent shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="xs" variant="soft" loading={drafting}>
              {!drafting && <Wand2 />} {text ? "Upravit s AI" : "Napsat s AI"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Sparkles className="size-3.5 text-ai" /> Instrukce pro AI
            </p>
            <div className="flex flex-wrap gap-1">
              {QUICK.map((q) => (
                <button key={q} onClick={() => void aiDraft(q)} className="rounded-full border border-border px-2 py-0.5 text-[11.5px] hover:bg-muted">
                  {q}
                </button>
              ))}
            </div>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void aiDraft();
              }}
            >
              <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Např. poděkuj a navrhni čtvrtek 15:00" className="h-8 text-xs" />
              <Button size="xs" type="submit" variant="ai">
                OK
              </Button>
            </form>
            <p className="text-[11px] text-muted-foreground">AI pouze navrhuje – nic neodesílá. Text vždy zkontrolujte.</p>
          </PopoverContent>
        </Popover>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={resolve} onCheckedChange={(v) => setResolve(Boolean(v))} /> Označit jako vyřízené
        </label>
        <div className="ml-auto flex items-center gap-2">
          {manual && message.reply.note && <span className="hidden max-w-56 truncate text-[11px] text-muted-foreground xl:inline" title={message.reply.note}>{message.reply.note}</span>}
          <Button size="sm" onClick={() => void send()} disabled={!text.trim()} loading={reply.isPending}>
            {manual ? (
              <>
                <Copy /> Uložit a zkopírovat
              </>
            ) : (
              <>
                <Send /> Odeslat ({message.reply.via})
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});
