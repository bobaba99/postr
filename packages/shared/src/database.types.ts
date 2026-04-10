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
      users: {
        Row: {
          cookie_consent_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_anonymous: boolean
        }
        Insert: {
          cookie_consent_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_anonymous?: boolean
        }
        Update: {
          cookie_consent_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_anonymous?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

