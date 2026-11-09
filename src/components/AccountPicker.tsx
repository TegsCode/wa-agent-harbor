import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccounts } from "@/lib/wa/queries";

export function AccountPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: accounts = [] } = useAccounts();
  useEffect(() => {
    if (!value && accounts[0]) onChange(accounts[0].id);
  }, [accounts, value, onChange]);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-60"><SelectValue placeholder="Choose account" /></SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>{a.label} {a.status !== "connected" ? `(${a.status})` : ""}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
