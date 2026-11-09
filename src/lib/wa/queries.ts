import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_accounts").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });
}

export function useBridgeSettings() {
  return useQuery({
    queryKey: ["bridge"],
    queryFn: async () => {
      const { data } = await supabase.from("bridge_settings").select("*").eq("id", 1).maybeSingle();
      return data;
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      return { id: u.user.id, email: u.user.email ?? "", isAdmin: !!data?.some((r) => r.role === "admin") };
    },
  });
}
