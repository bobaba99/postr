export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_emails: {
        Row: {
          added_at: string
          email: string
          note: string | null
        }
        Insert: {
          added_at?: string
          email: string
          note?: string | null
        }
        Update: {
          added_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      assets: {
        Row: {
          created_at: string
          height: number | null
          id: string
          mime_type: string | null
          poster_id: string | null
          size_bytes: number | null
          storage_path: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          poster_id?: string | null
          size_bytes?: number | null
          storage_path: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          poster_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      authors_lib: {
        Row: {
          affiliation_lib_ids: string[]
          created_at: string
          equal_contrib: boolean
          id: string
          is_corresponding: boolean
          name: string
          user_id: string
        }
        Insert: {
          affiliation_lib_ids?: string[]
          created_at?: string
          equal_contrib?: boolean
          id?: string
          is_corresponding?: boolean
          name: string
          user_id: string
        }
        Update: {
          affiliation_lib_ids?: string[]
          created_at?: string
          equal_contrib?: boolean
          id?: string
          is_corresponding?: boolean
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authors_lib_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_fulfilled_sessions: {
        Row: {
          credits_granted: number
          fulfilled_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          credits_granted?: number
          fulfilled_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          credits_granted?: number
          fulfilled_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_refunds: {
        Row: {
          amount_cents: number
          created_at: string
          credits_revoked: number
          id: string
          kind: string
          session_id: string | null
          stripe_refund_id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          credits_revoked?: number
          id?: string
          kind: string
          session_id?: string | null
          stripe_refund_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credits_revoked?: number
          id?: string
          kind?: string
          session_id?: string | null
          stripe_refund_id?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          page_url: string | null
          status: string
          title: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          page_url?: string | null
          status?: string
          title: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          page_url?: string | null
          status?: string
          title?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      gallery_entries: {
        Row: {
          conference: string | null
          created_at: string
          field: Database["public"]["Enums"]["gallery_field"]
          id: string
          image_path: string
          notes: string | null
          pdf_path: string | null
          poster_id: string | null
          retracted_at: string | null
          retracted_by: string | null
          retraction_reason: string | null
          source: Database["public"]["Enums"]["gallery_source"]
          title: string
          user_id: string
          year: number | null
        }
        Insert: {
          conference?: string | null
          created_at?: string
          field: Database["public"]["Enums"]["gallery_field"]
          id?: string
          image_path: string
          notes?: string | null
          pdf_path?: string | null
          poster_id?: string | null
          retracted_at?: string | null
          retracted_by?: string | null
          retraction_reason?: string | null
          source: Database["public"]["Enums"]["gallery_source"]
          title: string
          user_id: string
          year?: number | null
        }
        Update: {
          conference?: string | null
          created_at?: string
          field?: Database["public"]["Enums"]["gallery_field"]
          id?: string
          image_path?: string
          notes?: string | null
          pdf_path?: string | null
          poster_id?: string | null
          retracted_at?: string | null
          retracted_by?: string | null
          retraction_reason?: string | null
          source?: Database["public"]["Enums"]["gallery_source"]
          title?: string
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_entries_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions_lib: {
        Row: {
          created_at: string
          dept: string | null
          id: string
          location: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dept?: string | null
          id?: string
          location?: string | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          dept?: string | null
          id?: string
          location?: string | null
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "institutions_lib_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      poster_comments: {
        Row: {
          anchor: Json
          anchor_type: string
          author_name: string
          body: string
          created_at: string
          id: string
          parent_id: string | null
          poster_id: string
          resolved_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor?: Json
          anchor_type: string
          author_name: string
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          poster_id: string
          resolved_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor?: Json
          anchor_type?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          poster_id?: string
          resolved_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poster_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "poster_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poster_comments_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      poster_reviews: {
        Row: {
          created_at: string
          credit_source: string | null
          followup_findings: Json | null
          id: string
          initial_findings: Json | null
          poster_id: string | null
          source_kind: string
          source_meta: Json
          stage: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_source?: string | null
          followup_findings?: Json | null
          id?: string
          initial_findings?: Json | null
          poster_id?: string | null
          source_kind: string
          source_meta?: Json
          stage?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credit_source?: string | null
          followup_findings?: Json | null
          id?: string
          initial_findings?: Json | null
          poster_id?: string | null
          source_kind?: string
          source_meta?: Json
          stage?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poster_reviews_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      poster_versions: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          poster_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          name?: string
          poster_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          poster_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poster_versions_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "posters"
            referencedColumns: ["id"]
          },
        ]
      }
      posters: {
        Row: {
          created_at: string
          data: Json
          height_in: number
          id: string
          is_public: boolean
          share_slug: string | null
          thumbnail_path: string | null
          title: string
          updated_at: string
          user_id: string
          width_in: number
        }
        Insert: {
          created_at?: string
          data?: Json
          height_in?: number
          id?: string
          is_public?: boolean
          share_slug?: string | null
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
          user_id: string
          width_in?: number
        }
        Update: {
          created_at?: string
          data?: Json
          height_in?: number
          id?: string
          is_public?: boolean
          share_slug?: string | null
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          width_in?: number
        }
        Relationships: [
          {
            foreignKeyName: "posters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      presets: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          source: string
          thumbnail_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          name: string
          source: string
          thumbnail_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          source?: string
          thumbnail_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      references_lib: {
        Row: {
          authors: string[]
          created_at: string
          doi: string | null
          id: string
          journal: string | null
          title: string | null
          user_id: string
          year: string | null
        }
        Insert: {
          authors?: string[]
          created_at?: string
          doi?: string | null
          id?: string
          journal?: string | null
          title?: string | null
          user_id: string
          year?: string | null
        }
        Update: {
          authors?: string[]
          created_at?: string
          doi?: string | null
          id?: string
          journal?: string | null
          title?: string | null
          user_id?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "references_lib_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      talk_waitlist: {
        Row: {
          email: string | null
          joined_at: string
          user_id: string
        }
        Insert: {
          email?: string | null
          joined_at?: string
          user_id: string
        }
        Update: {
          email?: string | null
          joined_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_logos: {
        Row: {
          created_at: string
          id: string
          name: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          cookie_consent_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          export_credits: number
          first_paid_export_at: string | null
          id: string
          is_anonymous: boolean
          marketing_consent_at: string | null
          plan: string
          plan_expires_at: string | null
          research_consent_at: string | null
          review_addon: boolean
          review_addon_subscription_id: string | null
          review_credits: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
        }
        Insert: {
          cookie_consent_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          export_credits?: number
          first_paid_export_at?: string | null
          id: string
          is_anonymous?: boolean
          marketing_consent_at?: string | null
          plan?: string
          plan_expires_at?: string | null
          research_consent_at?: string | null
          review_addon?: boolean
          review_addon_subscription_id?: string | null
          review_credits?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
        }
        Update: {
          cookie_consent_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          export_credits?: number
          first_paid_export_at?: string | null
          id?: string
          is_anonymous?: boolean
          marketing_consent_at?: string | null
          plan?: string
          plan_expires_at?: string | null
          research_consent_at?: string | null
          review_addon?: boolean
          review_addon_subscription_id?: string | null
          review_credits?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_export_credit: { Args: { p_user_id: string }; Returns: number }
      consume_review_credit: { Args: { p_user_id: string }; Returns: number }
      delete_own_account: { Args: never; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      grant_export_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      grant_review_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      is_gallery_admin: { Args: { uid: string }; Returns: boolean }
      mark_first_paid_export: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      revoke_export_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
    }
    Enums: {
      gallery_field:
        | "neuroscience"
        | "psychology"
        | "medicine"
        | "biology"
        | "computer_science"
        | "physics"
        | "chemistry"
        | "engineering"
        | "social_sciences"
        | "humanities"
        | "other"
      gallery_source: "postr_poster" | "upload"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      gallery_field: [
        "neuroscience",
        "psychology",
        "medicine",
        "biology",
        "computer_science",
        "physics",
        "chemistry",
        "engineering",
        "social_sciences",
        "humanities",
        "other",
      ],
      gallery_source: ["postr_poster", "upload"],
    },
  },
} as const

