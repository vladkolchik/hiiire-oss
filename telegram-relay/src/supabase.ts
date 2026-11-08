import { createClient, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import WebSocket from "ws";

import type { RelayConfig } from "./config.js";
import type { ConnectTokenRow, TelegramRelayStore, UserLinkRow } from "./server.js";

export function createSupabaseTelegramStore(config: RelayConfig): TelegramRelayStore {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: WebSocket as WebSocketLikeConstructor,
    },
  });

  return {
    async markLastSeen(chatId, seenAt) {
      await supabase.from("telegram_user_links").update({ last_seen_at: seenAt }).eq("chat_id", chatId);
    },

    async deleteUserLinkByChatId(chatId) {
      const { error } = await supabase.from("telegram_user_links").delete().eq("chat_id", chatId);
      if (error) throw new Error(`TELEGRAM_LINK_DELETE_FAILED: ${error.message}`);
    },

    async getConnectToken(token): Promise<ConnectTokenRow | null> {
      const { data, error } = await supabase
        .from("telegram_connect_tokens")
        .select("token,user_id,expires_at,used_at")
        .eq("token", token)
        .maybeSingle();

      if (error) throw new Error(`TELEGRAM_CONNECT_TOKEN_LOOKUP_FAILED: ${error.message}`);
      if (!data) return null;

      return {
        token: String(data.token),
        userId: String(data.user_id),
        expiresAt: String(data.expires_at),
        usedAt: data.used_at ? String(data.used_at) : null,
      };
    },

    async claimConnectToken(token, usedAt): Promise<ConnectTokenRow | null> {
      const { data, error } = await supabase
        .from("telegram_connect_tokens")
        .update({ used_at: usedAt })
        .eq("token", token)
        .is("used_at", null)
        .gt("expires_at", usedAt)
        .select("token,user_id,expires_at,used_at")
        .maybeSingle();

      if (error) throw new Error(`TELEGRAM_CONNECT_TOKEN_CLAIM_FAILED: ${error.message}`);
      if (!data) return null;

      return {
        token: String(data.token),
        userId: String(data.user_id),
        expiresAt: String(data.expires_at),
        usedAt: data.used_at ? String(data.used_at) : null,
      };
    },

    async getUserLinkByChatId(chatId): Promise<UserLinkRow | null> {
      const { data, error } = await supabase
        .from("telegram_user_links")
        .select("user_id,chat_id")
        .eq("chat_id", chatId)
        .maybeSingle();

      if (error) throw new Error(`TELEGRAM_LINK_LOOKUP_FAILED: ${error.message}`);
      if (!data) return null;

      return {
        userId: String(data.user_id),
        chatId: Number(data.chat_id),
      };
    },

    async upsertUserLink(input) {
      const { error } = await supabase.from("telegram_user_links").upsert(
        {
          user_id: input.userId,
          chat_id: input.chatId,
          connected_at: input.connectedAt,
          last_seen_at: input.lastSeenAt,
        },
        { onConflict: "user_id" },
      );

      if (error) throw new Error(`TELEGRAM_LINK_UPSERT_FAILED: ${error.message}`);
    },
  };
}
