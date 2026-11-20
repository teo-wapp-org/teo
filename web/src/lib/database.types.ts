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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: number
          metadata: Json
          org_id: string | null
          target: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          org_id?: string | null
          target?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          org_id?: string | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          case_id: string | null
          created_at: string
          error: string | null
          id: string
          input_tokens: number | null
          kind: string
          latency_ms: number | null
          model: string | null
          org_id: string
          output_tokens: number | null
          stop_reason: string | null
          tools: Json
        }
        Insert: {
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          case_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          kind?: string
          latency_ms?: number | null
          model?: string | null
          org_id: string
          output_tokens?: number | null
          stop_reason?: string | null
          tools?: Json
        }
        Update: {
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          case_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          kind?: string
          latency_ms?: number | null
          model?: string | null
          org_id?: string
          output_tokens?: number | null
          stop_reason?: string | null
          tools?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_settings: {
        Row: {
          business_hours: Json
          display_name: string
          enabled: boolean
          escalation_amount_usd: number | null
          escalation_keywords: string[]
          extra_instructions: string | null
          greeting: string | null
          mode: Database["public"]["Enums"]["agent_mode"]
          org_id: string
          out_of_hours_message: string | null
          payment_expiry_hours: number
          updated_at: string
        }
        Insert: {
          business_hours?: Json
          display_name?: string
          enabled?: boolean
          escalation_amount_usd?: number | null
          escalation_keywords?: string[]
          extra_instructions?: string | null
          greeting?: string | null
          mode?: Database["public"]["Enums"]["agent_mode"]
          org_id: string
          out_of_hours_message?: string | null
          payment_expiry_hours?: number
          updated_at?: string
        }
        Update: {
          business_hours?: Json
          display_name?: string
          enabled?: boolean
          escalation_amount_usd?: number | null
          escalation_keywords?: string[]
          extra_instructions?: string | null
          greeting?: string | null
          mode?: Database["public"]["Enums"]["agent_mode"]
          org_id?: string
          out_of_hours_message?: string | null
          payment_expiry_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          actions: Json
          case_id: string
          created_at: string
          id: string
          message_id: string | null
          org_id: string
          state: string
          text: string
        }
        Insert: {
          actions?: Json
          case_id: string
          created_at?: string
          id?: string
          message_id?: string | null
          org_id: string
          state?: string
          text: string
        }
        Update: {
          actions?: Json
          case_id?: string
          created_at?: string
          id?: string
          message_id?: string | null
          org_id?: string
          state?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_case_id_org_id_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ai_suggestions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          description: string | null
          faqs: Json
          google_place_id: string | null
          instagram: string | null
          org_id: string
          phone: string | null
          policies: Json
          tone: string
          updated_at: string
          use_emojis: boolean
          use_usted: boolean
          website: string | null
        }
        Insert: {
          description?: string | null
          faqs?: Json
          google_place_id?: string | null
          instagram?: string | null
          org_id: string
          phone?: string | null
          policies?: Json
          tone?: string
          updated_at?: string
          use_emojis?: boolean
          use_usted?: boolean
          website?: string | null
        }
        Update: {
          description?: string | null
          faqs?: Json
          google_place_id?: string | null
          instagram?: string | null
          org_id?: string
          phone?: string | null
          policies?: Json
          tone?: string
          updated_at?: string
          use_emojis?: boolean
          use_usted?: boolean
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          actor: string
          case_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["case_status"] | null
          id: number
          metadata: Json
          org_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["case_status"] | null
        }
        Insert: {
          actor: string
          case_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["case_status"] | null
          id?: never
          metadata?: Json
          org_id: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["case_status"] | null
        }
        Update: {
          actor?: string
          case_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["case_status"] | null
          id?: never
          metadata?: Json
          org_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["case_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_org_id_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      cases: {
        Row: {
          assignee_id: string | null
          close_reason: string | null
          closed_at: string | null
          contact_id: string
          conversation_id: string
          created_at: string
          estimated_amount: number | null
          id: string
          number: number
          opened_at: string
          org_id: string
          previous_status: Database["public"]["Enums"]["case_status"] | null
          priority: number
          status: Database["public"]["Enums"]["case_status"]
          status_changed_at: string
          summary: string | null
          type: Database["public"]["Enums"]["case_type"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          contact_id: string
          conversation_id: string
          created_at?: string
          estimated_amount?: number | null
          id?: string
          number?: number
          opened_at?: string
          org_id: string
          previous_status?: Database["public"]["Enums"]["case_status"] | null
          priority?: number
          status?: Database["public"]["Enums"]["case_status"]
          status_changed_at?: string
          summary?: string | null
          type?: Database["public"]["Enums"]["case_type"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          estimated_amount?: number | null
          id?: string
          number?: number
          opened_at?: string
          org_id?: string
          previous_status?: Database["public"]["Enums"]["case_status"] | null
          priority?: number
          status?: Database["public"]["Enums"]["case_status"]
          status_changed_at?: string
          summary?: string | null
          type?: Database["public"]["Enums"]["case_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "cases_conversation_id_org_id_fkey"
            columns: ["conversation_id", "org_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          ai_summary: string | null
          created_at: string
          email: string | null
          id: string
          last_message_at: string | null
          name: string | null
          notes: string | null
          opt_in_marketing: boolean
          org_id: string
          profile_name: string | null
          tags: string[]
          updated_at: string
          wa_id: string
        }
        Insert: {
          address?: string | null
          ai_summary?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_message_at?: string | null
          name?: string | null
          notes?: string | null
          opt_in_marketing?: boolean
          org_id: string
          profile_name?: string | null
          tags?: string[]
          updated_at?: string
          wa_id: string
        }
        Update: {
          address?: string | null
          ai_summary?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_message_at?: string | null
          name?: string | null
          notes?: string | null
          opt_in_marketing?: boolean
          org_id?: string
          profile_name?: string | null
          tags?: string[]
          updated_at?: string
          wa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: string
          contact_id: string
          created_at: string
          handled_by: Database["public"]["Enums"]["handled_by"]
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          org_id: string
          whatsapp_account_id: string | null
        }
        Insert: {
          channel?: string
          contact_id: string
          created_at?: string
          handled_by?: Database["public"]["Enums"]["handled_by"]
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          org_id: string
          whatsapp_account_id?: string | null
        }
        Update: {
          channel?: string
          contact_id?: string
          created_at?: string
          handled_by?: Database["public"]["Enums"]["handled_by"]
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          org_id?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_account_id_org_id_fkey"
            columns: ["whatsapp_account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author: string
          body: string | null
          case_id: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          error: string | null
          id: string
          media_mime: string | null
          media_path: string | null
          org_id: string
          payload: Json | null
          status: Database["public"]["Enums"]["message_status"]
          type: string
          wamid: string | null
        }
        Insert: {
          author: string
          body?: string | null
          case_id?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          error?: string | null
          id?: string
          media_mime?: string | null
          media_path?: string | null
          org_id: string
          payload?: Json | null
          status?: Database["public"]["Enums"]["message_status"]
          type?: string
          wamid?: string | null
        }
        Update: {
          author?: string
          body?: string | null
          case_id?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          error?: string | null
          id?: string
          media_mime?: string | null
          media_path?: string | null
          org_id?: string
          payload?: Json | null
          status?: Database["public"]["Enums"]["message_status"]
          type?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_case_id_org_id_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "messages_conversation_id_org_id_fkey"
            columns: ["conversation_id", "org_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          name: string
          order_id: string
          org_id: string
          product_id: string | null
          quantity: number
          subtotal: number | null
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          name: string
          order_id: string
          org_id: string
          product_id?: string | null
          quantity: number
          subtotal?: number | null
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          order_id?: string
          org_id?: string
          product_id?: string | null
          quantity?: number
          subtotal?: number | null
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_org_id_fkey"
            columns: ["order_id", "org_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "order_items_product_id_org_id_fkey"
            columns: ["product_id", "org_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_org_id_fkey"
            columns: ["variant_id", "org_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      orders: {
        Row: {
          case_id: string
          contact_id: string
          created_at: string
          currency: string
          delivery: Json
          id: string
          notes: string | null
          org_id: string
          shipping: number
          status: Database["public"]["Enums"]["order_status"]
          store_id: string | null
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          case_id: string
          contact_id: string
          created_at?: string
          currency?: string
          delivery?: Json
          id?: string
          notes?: string | null
          org_id: string
          shipping?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          case_id?: string
          contact_id?: string
          created_at?: string
          currency?: string
          delivery?: Json
          id?: string
          notes?: string | null
          org_id?: string
          shipping?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_case_id_org_id_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "orders_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "orders_store_id_org_id_fkey"
            columns: ["store_id", "org_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          rubro: string | null
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          rubro?: string | null
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          rubro?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          details: Json
          id: string
          instructions: string | null
          label: string
          org_id: string
          sort_order: number
          type: Database["public"]["Enums"]["payment_method_type"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          details?: Json
          id?: string
          instructions?: string | null
          label: string
          org_id: string
          sort_order?: number
          type: Database["public"]["Enums"]["payment_method_type"]
        }
        Update: {
          active?: boolean
          created_at?: string
          details?: Json
          id?: string
          instructions?: string | null
          label?: string
          org_id?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["payment_method_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          ai_extraction: Json | null
          created_at: string
          declared_amount: number | null
          id: string
          order_id: string
          org_id: string
          payment_method_id: string | null
          receipt_message_id: string | null
          receipt_path: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          ai_extraction?: Json | null
          created_at?: string
          declared_amount?: number | null
          id?: string
          order_id: string
          org_id: string
          payment_method_id?: string | null
          receipt_message_id?: string | null
          receipt_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          ai_extraction?: Json | null
          created_at?: string
          declared_amount?: number | null
          id?: string
          order_id?: string
          org_id?: string
          payment_method_id?: string | null
          receipt_message_id?: string | null
          receipt_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_org_id_fkey"
            columns: ["order_id", "org_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "payments_payment_method_id_org_id_fkey"
            columns: ["payment_method_id", "org_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "payments_receipt_message_id_fkey"
            columns: ["receipt_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          features: string[]
          highlighted: boolean
          id: string
          max_products: number | null
          max_stores: number | null
          max_users: number | null
          name: string
          price_usd_month: number
          sort_order: number
          teo_messages_month: number
        }
        Insert: {
          active?: boolean
          features?: string[]
          highlighted?: boolean
          id: string
          max_products?: number | null
          max_stores?: number | null
          max_users?: number | null
          name: string
          price_usd_month: number
          sort_order?: number
          teo_messages_month: number
        }
        Update: {
          active?: boolean
          features?: string[]
          highlighted?: boolean
          id?: string
          max_products?: number | null
          max_stores?: number | null
          max_users?: number | null
          name?: string
          price_usd_month?: number
          sort_order?: number
          teo_messages_month?: number
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          created_at: string
          id: string
          org_id: string
          product_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          product_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          product_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_org_id_fkey"
            columns: ["product_id", "org_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          id: string
          name: string
          org_id: string
          price: number | null
          product_id: string
          sort_order: number
          stock: number | null
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          org_id: string
          price?: number | null
          product_id: string
          sort_order?: number
          stock?: number | null
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          org_id?: string
          price?: number | null
          product_id?: string
          sort_order?: number
          stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_org_id_fkey"
            columns: ["product_id", "org_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          attributes: Json
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          org_id: string
          price: number
          search_tsv: unknown
          sku: string | null
          stock: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          attributes?: Json
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          price: number
          search_tsv?: unknown
          sku?: string | null
          stock?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          attributes?: Json
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          price?: number
          search_tsv?: unknown
          sku?: string | null
          stock?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_org_id_fkey"
            columns: ["category_id", "org_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          created_at: string
          delivery_available: boolean
          delivery_notes: string | null
          google_place_id: string | null
          hours: Json
          id: string
          lat: number | null
          lng: number | null
          name: string
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          delivery_available?: boolean
          delivery_notes?: string | null
          google_place_id?: string | null
          hours?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          delivery_available?: boolean
          delivery_notes?: string | null
          google_place_id?: string | null
          hours?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          org_id: string
          plan_id: string
          provider: string | null
          provider_ref: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          org_id: string
          plan_id: string
          provider?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          org_id?: string
          plan_id?: string
          provider?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          extra_messages: number
          org_id: string
          period_start: string
          teo_messages: number
        }
        Insert: {
          extra_messages?: number
          org_id: string
          period_start: string
          teo_messages?: number
        }
        Update: {
          extra_messages?: number
          org_id?: string
          period_start?: string
          teo_messages?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          connected_at: string | null
          created_at: string
          display_phone_number: string | null
          id: string
          org_id: string
          phone_number_id: string | null
          quality_rating: string | null
          status: Database["public"]["Enums"]["wa_account_status"]
          token_secret_id: string | null
          updated_at: string
          verified_name: string | null
          waba_id: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          display_phone_number?: string | null
          id?: string
          org_id: string
          phone_number_id?: string | null
          quality_rating?: string | null
          status?: Database["public"]["Enums"]["wa_account_status"]
          token_secret_id?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_id?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          display_phone_number?: string | null
          id?: string
          org_id?: string
          phone_number_id?: string | null
          quality_rating?: string | null
          status?: Database["public"]["Enums"]["wa_account_status"]
          token_secret_id?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_member_by_email: {
        Args: {
          p_email: string
          p_org: string
          p_role?: Database["public"]["Enums"]["org_role"]
        }
        Returns: string
      }
      admin_set_org_status: {
        Args: {
          p_org: string
          p_status: Database["public"]["Enums"]["org_status"]
        }
        Returns: undefined
      }
      can_operate: { Args: { p_org: string }; Returns: boolean }
      case_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["case_status"]
          p_to: Database["public"]["Enums"]["case_status"]
        }
        Returns: boolean
      }
      create_organization: {
        Args: { p_name: string; p_rubro?: string }
        Returns: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          rubro: string | null
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_org_role: {
        Args: {
          p_org: string
          p_roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      increment_teo_usage: {
        Args: { p_n?: number; p_org: string }
        Returns: number
      }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      log_admin_action: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_org?: string
          p_target?: string
        }
        Returns: undefined
      }
      org_members: {
        Args: { p_org: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }[]
      }
      recalc_order: {
        Args: { p_order: string }
        Returns: {
          case_id: string
          contact_id: string
          created_at: string
          currency: string
          delivery: Json
          id: string
          notes: string | null
          org_id: string
          shipping: number
          status: Database["public"]["Enums"]["order_status"]
          store_id: string | null
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_payment: {
        Args: { p_approve: boolean; p_payment: string; p_reason?: string }
        Returns: {
          ai_extraction: Json | null
          created_at: string
          declared_amount: number | null
          id: string
          order_id: string
          org_id: string
          payment_method_id: string | null
          receipt_message_id: string | null
          receipt_path: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_case: {
        Args: {
          p_actor?: string
          p_case: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["case_status"]
        }
        Returns: {
          assignee_id: string | null
          close_reason: string | null
          closed_at: string | null
          contact_id: string
          conversation_id: string
          created_at: string
          estimated_amount: number | null
          id: string
          number: number
          opened_at: string
          org_id: string
          previous_status: Database["public"]["Enums"]["case_status"] | null
          priority: number
          status: Database["public"]["Enums"]["case_status"]
          status_changed_at: string
          summary: string | null
          type: Database["public"]["Enums"]["case_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      agent_mode: "piloto" | "copiloto"
      case_status:
        | "nuevo"
        | "en_conversacion"
        | "cotizacion"
        | "esperando_pago"
        | "pago_por_confirmar"
        | "confirmado"
        | "requiere_atencion"
        | "cerrado_ganado"
        | "cerrado_perdido"
        | "resuelto"
      case_type: "venta" | "consulta" | "postventa" | "reclamo"
      handled_by: "teo" | "humano"
      message_direction: "in" | "out"
      message_status:
        | "received"
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
      order_status: "borrador" | "confirmado" | "pagado" | "cancelado"
      org_role: "owner" | "admin" | "operador"
      org_status: "onboarding" | "activo" | "suspendido"
      payment_method_type: "transferencia" | "efectivo" | "link" | "otro"
      payment_status: "pendiente" | "confirmado" | "rechazado"
      platform_role: "superadmin" | "soporte"
      subscription_status: "trial" | "active" | "past_due" | "canceled"
      wa_account_status: "pendiente" | "conectado" | "desconectado" | "error"
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
      agent_mode: ["piloto", "copiloto"],
      case_status: [
        "nuevo",
        "en_conversacion",
        "cotizacion",
        "esperando_pago",
        "pago_por_confirmar",
        "confirmado",
        "requiere_atencion",
        "cerrado_ganado",
        "cerrado_perdido",
        "resuelto",
      ],
      case_type: ["venta", "consulta", "postventa", "reclamo"],
      handled_by: ["teo", "humano"],
      message_direction: ["in", "out"],
      message_status: [
        "received",
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
      ],
      order_status: ["borrador", "confirmado", "pagado", "cancelado"],
      org_role: ["owner", "admin", "operador"],
      org_status: ["onboarding", "activo", "suspendido"],
      payment_method_type: ["transferencia", "efectivo", "link", "otro"],
      payment_status: ["pendiente", "confirmado", "rechazado"],
      platform_role: ["superadmin", "soporte"],
      subscription_status: ["trial", "active", "past_due", "canceled"],
      wa_account_status: ["pendiente", "conectado", "desconectado", "error"],
    },
  },
} as const
