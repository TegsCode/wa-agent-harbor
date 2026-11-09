import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

async function copyText(text: string): Promise<boolean> {
  // Clipboard API (modern browsers). Requires a secure context and focus.
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path below */
  }
  // Fallback: temporary textarea + execCommand. Works when the Clipboard API is
  // blocked (e.g. permissions, iframes, non-secure contexts).
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyBlock({ code, className }: { code: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className={cn("group relative", className)}>
      <pre className="max-h-80 overflow-auto rounded-lg bg-sidebar p-4 pr-12 font-mono text-xs leading-relaxed text-sidebar-accent-foreground">
        {code}
      </pre>
      <button
        type="button"
        aria-label="Copy"
        onClick={async () => {
          const ok = await copyText(code);
          if (ok) {
            toast.success("Copied to clipboard");
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } else {
            toast.error("Copy failed — select the text and press Ctrl+C");
            setDone(false);
          }
        }}
        className="absolute right-2 top-2 rounded-md bg-sidebar-accent p-1.5 text-sidebar-accent-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
      >
        {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
