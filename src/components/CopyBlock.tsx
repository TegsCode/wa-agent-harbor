import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function copyText(text: string, label = "Copied to clipboard") {
  navigator.clipboard.writeText(text).then(() => toast.success(label));
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
        onClick={() => {
          copyText(code);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md bg-sidebar-accent p-1.5 text-sidebar-accent-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
      >
        {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
