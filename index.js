// HiddenDM - Rewritten for Kettu (Vendetta/Bunny API)
// Original by dylan, ported to Kettu

import { findByProps, findByName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { registerCommand, unregisterCommand } from "@vendetta/commands";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms, General } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";

const { ScrollView, View, Text, TouchableOpacity, StyleSheet } = RN;
const { FormSection, FormRow } = Forms;

// ─── Module lookups ──────────────────────────────────────────────────────────
const Dispatcher       = findByProps("_currentDispatchActionType", "_subscriptions");
const MessageStore     = findByProps("getMessage", "getMessages");
const UserStore        = findByProps("getUser", "getUsers");
const ChannelStore     = findByProps("getChannel", "getDMUserIds", "getLastSelectedChannelId");
const AvatarUtils      = findByProps("getUserAvatarURL", "getGuildIconURL");
const MessageActions   = findByProps("sendMessage", "receiveMessage");
const ReadStateStore   = findByProps("getAllReadStates");
const BulkAck          = findByProps("bulkAck");
const NavigationUtils  = findByProps("acceptInviteAndTransitionToInviteChannel");
const Linking          = findByProps("openURL");

// ─── Fake message storage helpers ────────────────────────────────────────────
function getFakeMessages() {
  try {
    const raw = storage.fakeMessages;
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function saveFakeMessages(data) {
  try {
    storage.fakeMessages = JSON.stringify(data);
  } catch {}
}

// ─── Snowflake generator (matches Discord epoch) ─────────────────────────────
function generateSnowflake() {
  return ((Date.now() - 1420070400000) * 4194304).toString();
}

// ─── Inject a fake message into the Discord message dispatcher ───────────────
function injectFakeMessage(channelId, message, _source) {
  try {
    if (!Dispatcher || typeof Dispatcher.dispatch !== "function") return;

    const prepared = {
      ...message,
      state: "SENT",
      flags: message.flags || 0,
      blocked: false,
      pinned: false,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      reactions: [],
      attachments: [],
      embeds: [],
    };

    Dispatcher.dispatch({
      type: "MESSAGE_CREATE",
      channelId,
      message: prepared,
      optimistic: false,
      isFakeHiddenDM: true,
      guildId: message.guild_id,
      isPushNotification: false,
      suppressNotifications: true,
      suppressEmbeds: false,
      isRead: true,
      isAcknowledged: true,
      silent: true,
    });

    // Immediately ACK so it doesn't show as unread
    Dispatcher.dispatch({
      type: "MESSAGE_ACK",
      channelId,
      messageId: message.id,
      readState: "READ",
    });
  } catch (e) {
    console.error("[HiddenDM] injectFakeMessage error:", e);
  }
}

// ─── Preload all stored fake messages ────────────────────────────────────────
function preloadFakeMessages() {
  try {
    const all = getFakeMessages();
    const channelIds = Object.keys(all);
    for (const channelId of channelIds) {
      const msgs = all[channelId];
      if (!Array.isArray(msgs)) continue;
      [...msgs]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .forEach(msg => injectFakeMessage(channelId, msg, "preload"));
    }
  } catch (e) {
    console.error("[HiddenDM] preloadFakeMessages error:", e);
  }
}

// ─── Bulk-ack unread channels so fake messages don't ping ────────────────────
function clearUnreadStates() {
  try {
    if (!ReadStateStore?.getAllReadStates || !BulkAck?.bulkAck) return;
    const unread = ReadStateStore.getAllReadStates().filter(s =>
      ReadStateStore.hasUnread?.(s.channelId)
    );
    if (unread.length === 0) return;
    BulkAck.bulkAck(
      unread.map(s => ({ channelId: s.channelId, messageId: s._lastMessageId || s.lastMessageId }))
    );
  } catch {}
}

// ─── Add a fake message to persistent storage ────────────────────────────────
function storeFakeMessage(channelId, messageObj) {
  const all = getFakeMessages();
  if (!all[channelId]) all[channelId] = [];
  all[channelId].push(messageObj);
  saveFakeMessages(all);
}

// ─── Build a fake message object ─────────────────────────────────────────────
function buildFakeMessage({ channelId, authorId, content, replyToId }) {
  const author = UserStore?.getUser(authorId);
  const id = generateSnowflake();

  const msg = {
    id,
    channel_id: channelId,
    content,
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    reactions: [],
    pinned: false,
    type: 0,
    flags: 0,
    author: author
      ? {
          id: author.id,
          username: author.username,
          discriminator: author.discriminator,
          avatar: author.avatar,
          bot: author.bot || false,
          global_name: author.globalName || author.username,
        }
      : { id: authorId, username: "Unknown User", discriminator: "0000", avatar: null, bot: false },
  };

  if (replyToId) {
    const replyMsg =
      MessageStore?.getMessage(channelId, replyToId) ||
      getFakeMessages()[channelId]?.find(m => m.id === replyToId);
    if (replyMsg) {
      msg.type = 19; // REPLY type
      msg.message_reference = { channel_id: channelId, message_id: replyToId };
      msg.referenced_message = replyMsg;
    }
  }

  return msg;
}

// ─── Commands ────────────────────────────────────────────────────────────────
const registeredCommands = [];

function buildCommands() {
  return [
    {
      id: "hiddendm_dm",
      name: "dm",
      displayName: "dm",
      description: "Fake a DM convo between 2 people",
      displayDescription: "Fake a DM convo between 2 people",
      options: [
        {
          name: "person1",
          displayName: "person1",
          description: "Sends messages 1, 3, 5, 7, 9",
          displayDescription: "Sends messages 1, 3, 5, 7, 9",
          type: 6,
          required: true,
        },
        {
          name: "person2",
          displayName: "person2",
          description: "Sends messages 2, 4, 6, 8, 10",
          displayDescription: "Sends messages 2, 4, 6, 8, 10",
          type: 6,
          required: true,
        },
        {
          name: "messages",
          displayName: "messages",
          description: "All messages separated by | (e.g. hey | whats up | nm wbu)",
          displayDescription: "All messages separated by | (e.g. hey | whats up | nm wbu)",
          type: 3,
          required: true,
        },
      ],
      execute(args, ctx) {
        try {
          const person1 = args.find(a => a.name === "person1")?.value;
          const person2 = args.find(a => a.name === "person2")?.value;
          const raw = args.find(a => a.name === "messages")?.value;
          const channelId = ctx.channel.id;

          if (!person1 || !person2 || !raw) {
            showToast("Missing arguments.", getAssetIDByName("Small"));
            return;
          }

          const messages = raw.split("|").map(m => m.trim()).filter(m => m.length > 0);
          if (messages.length === 0) {
            showToast("No messages found. Separate them with |", getAssetIDByName("Small"));
            return;
          }

          // First message = random time yesterday, rest spaced 30s-5min apart
          const now = Date.now();
          const yesterdayStart = now - (24 * 60 * 60 * 1000);
          const randomOffset = Math.floor(Math.random() * (16 * 60 * 60 * 1000));
          const firstMsgTime = yesterdayStart - (8 * 60 * 60 * 1000) + randomOffset;

          const timestamps = [firstMsgTime];
          for (let i = 1; i < messages.length; i++) {
            const gap = 30000 + Math.floor(Math.random() * 270000);
            timestamps.push(timestamps[i - 1] + gap);
          }

          let injected = 0;
          for (let i = 0; i < messages.length; i++) {
            const authorId = i % 2 === 0 ? person1 : person2;
            const msg = buildFakeMessage({ channelId, authorId, content: messages[i] });
            msg.timestamp = new Date(timestamps[i]).toISOString();

            storeFakeMessage(channelId, msg);
            injectFakeMessage(channelId, msg, "command_dm");
            injected++;
          }

          clearUnreadStates();
          showToast(`Injected ${injected} message(s).`, getAssetIDByName("Check"));
        } catch (e) {
          console.error("[HiddenDM] /dm error:", e);
          showToast("Failed to create conversation.", getAssetIDByName("Small"));
        }
      },
    },
    {
      id: "hiddendm_clear",
      name: "hiddendm_clear",
      displayName: "hiddendm_clear",
      description: "Clear all fake messages in this channel",
      displayDescription: "Clear all fake messages in this channel",
      options: [],
      execute(_args, ctx) {
        try {
          const all = getFakeMessages();
          const channelId = ctx.channel.id;
          const count = all[channelId]?.length || 0;
          delete all[channelId];
          saveFakeMessages(all);
          showToast(`Cleared ${count} fake message(s).`, getAssetIDByName("Trash"));
        } catch (e) {
          console.error("[HiddenDM] /hiddendm_clear error:", e);
        }
      },
    },
  ];
}

// ─── Settings panel ──────────────────────────────────────────────────────────
export function SettingsPage() {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    try {
      const all = getFakeMessages();
      let total = 0;
      Object.values(all).forEach(arr => { total += Array.isArray(arr) ? arr.length : 0; });
      setCount(total);
    } catch { setCount(0); }
  }, []);

  const clearAll = () => {
    saveFakeMessages({});
    setCount(0);
    showToast("All fake messages cleared.", getAssetIDByName("Trash"));
  };

  const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
      padding: 16,
      alignItems: "center",
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      color: "#8A2BE2",
    },
    subtitle: {
      fontSize: 14,
      opacity: 0.6,
      marginTop: 4,
    },
    dangerBtn: {
      margin: 16,
      backgroundColor: "#f04747",
      borderRadius: 8,
      padding: 12,
      alignItems: "center",
    },
    dangerBtnText: {
      color: "#fff",
      fontWeight: "bold",
      fontSize: 14,
    },
    footer: {
      textAlign: "center",
      opacity: 0.4,
      fontSize: 12,
      marginTop: 8,
      marginBottom: 24,
    },
  });

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HiddenDM</Text>
        <Text style={styles.subtitle}>by dylan • v1.0.0</Text>
      </View>

      <FormSection title="COMMANDS">
        <FormRow label="/dm [person1] [person2] [m1-m10]" subLabel="Create a fake 2-person DM — person1 sends odd messages, person2 sends even" />
        <FormRow label="/hiddendm_clear" subLabel="Clear all fake messages in the current channel" />
      </FormSection>

      <FormSection title="STORAGE">
        <FormRow label="Fake Messages" subLabel={`You have ${count} fake message(s) stored`} />
      </FormSection>

      <TouchableOpacity style={styles.dangerBtn} onPress={clearAll}>
        <Text style={styles.dangerBtnText}>Clear ALL Fake Messages</Text>
      </TouchableOpacity>

      <FormSection title="LINKS">
        <FormRow
          label="GitHub Repository"
          trailing={FormRow.Arrow}
          onPress={() => Linking?.openURL("https://github.com/yourusername/HiddenDM")}
        />
      </FormSection>

      <Text style={styles.footer}>HiddenDM v1.0.0</Text>
    </ScrollView>
  );
}

// ─── Plugin lifecycle ─────────────────────────────────────────────────────────
let dispatcherUnsubscribes = [];

export default {
  onLoad() {
    // Register slash commands
    const cmds = buildCommands();
    for (const cmd of cmds) {
      try {
        registerCommand(cmd);
        registeredCommands.push(cmd.id);
      } catch (e) {
        console.error(`[HiddenDM] Failed to register command ${cmd.name}:`, e);
      }
    }

    // Re-inject fake messages whenever the message store loads
    const handleLoad = (evt) => {
      const channelId = evt?.channelId;
      if (!channelId) return;
      const stored = getFakeMessages()[channelId];
      if (!stored || stored.length === 0) return;
      const existing = MessageStore?.getMessages?.(channelId);
      const existingIds = new Set(existing?.toArray?.().map(m => m.id) ?? []);
      stored
        .filter(m => !existingIds.has(m.id))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .forEach(m => injectFakeMessage(channelId, m, "load_event"));
    };

    const events = [
      "LOAD_MESSAGES_SUCCESS",
      "LOAD_MESSAGES_AROUND_SUCCESS",
      "LOAD_MESSAGES_SUCCESS_CACHED",
      "JUMP_TO_MESSAGE",
    ];

    for (const event of events) {
      Dispatcher?.subscribe(event, handleLoad);
      dispatcherUnsubscribes.push(() => Dispatcher?.unsubscribe(event, handleLoad));
    }

    // Preload already-stored messages on plugin start
    preloadFakeMessages();
  },

  onUnload() {
    // Unregister commands
    for (const id of registeredCommands) {
      try { unregisterCommand(id); } catch {}
    }
    registeredCommands.length = 0;

    // Unsubscribe dispatcher listeners
    for (const unsub of dispatcherUnsubscribes) unsub();
    dispatcherUnsubscribes = [];
  },
};
