"use client";
import { useEffect } from "react";

/** Registers the service worker (web push + offline shell). Subscription happens in Settings → Notifikace. */
export function PushPrompt() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
