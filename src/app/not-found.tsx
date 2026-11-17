import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Compass className="size-6" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">Stránka nenalezena</h1>
        <p className="mt-1 text-sm text-muted-foreground">Odkaz je neplatný nebo k němu nemáte přístup.</p>
      </div>
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        Zpět na přehled
      </Link>
    </div>
  );
}
