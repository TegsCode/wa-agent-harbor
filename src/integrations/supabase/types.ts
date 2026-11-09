export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_keys: {
        Row: {
          account_ids: string[]
          actions: string[]
          allowed_chats: string[]
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
        }
        Insert: {
          account_ids?: string[]
          actions?: string[]
          allowed_chats?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
        }
        Update: {
          account_ids?: string[]
          actions?: string[]
          allowed_chats?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      agent_requests: {
        Row: {
          created_at: string
          error: string | null
          id: string
          key_id: string | null
          ok: boolean
          tool: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          key_id?: string | null
          ok: boolean
          tool: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          key_id?: string | null
          ok?: boolean
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_requests_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "agent_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      bridge_settings: {
        Row: {
          bridge_api_key: string | null
          bridge_url: string | null
          id: number
          updated_at: string
        }
        Insert: {
          bridge_api_key?: string | null
          bridge_url?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          bridge_api_key?: string | null
          bridge_url?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          account_id: string
          created_at: string
          id: string
          name: string | null
          notes: string | null
          phone: string
          tags: string[]
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone: string
          tags?: string[]
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wa_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          created_at: string
          email: string
          invited_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          invited_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          invited_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wa_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          instance_name: string
          is_demo: boolean
          label: string
          phone_number: string | null
          profile_picture_url: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          instance_name: string
          is_demo?: boolean
          label: string
          phone_number?: string | null
          profile_picture_url?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          instance_name?: string
          is_demo?: boolean
          label?: string
          phone_number?: string | null
          profile_picture_url?: string | null
          status?: string
        }
        Relationships: []
      }
      wa_groups: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          id: string
          jid: string
          name: string
          participants: Json
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          id?: string
          jid: string
          name: string
          participants?: Json
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          jid?: string
          name?: string
          participants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "wa_groups_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wa_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          account_id: string
          author: string | null
          body: string
          chat_id: string
          chat_name: string | null
          created_at: string
          from_me: boolean
          id: string
          is_group: boolean
          is_read: boolean
          sent_by_agent: string | null
          status: string
        }
        Insert: {
          account_id: string
          author?: string | null
          body: string
          chat_id: string
          chat_name?: string | null
          created_at?: string
          from_me?: boolean
          id?: string
          is_group?: boolean
          is_read?: boolean
          sent_by_agent?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          author?: string | null
          body?: string
          chat_id?: string
          chat_name?: string | null
          created_at?: string
          from_me?: boolean
          id?: string
          is_group?: boolean
          is_read?: boolean
          sent_by_agent?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wa_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
    },
  },
} as const
