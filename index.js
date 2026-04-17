// HiddenDM - Rewritten for Kettu (Vendetta/Bunny API)
// Original by dylan, ported to Kettu

import { findByProps } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { registerCommand, unregisterCommand } from "@vendetta/commands";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";

const { ScrollView, View, Text, TouchableOpacity, StyleSheet } = RN;
const { FormSection, FormRow } = Forms;

const Dispatcher = findByProps("_currentDispatchActionType", "_subscriptions");
const MessageStore = findByProps("getMessage", "getMessages");
const UserStore = findByProps("getUser", "getUsers");
const ReadStateStore = findByProps("getAllReadStates");
const BulkAck = findByProps("bulkAck");
const Linking = findByProps("openURL");

function getFakeMessages() {
  try {
    const raw = storage.fakeMessages;
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch { return {}; }
}

function saveFakeMessages(data) {
  try { storage.fakeMessages = JSON.stringify(data); } catch {}
}

function generateSnowflake() {
  return ((Date.now() - 1420070400000) * 4194304).toString();
}

function injectFakeMessage(channelId, message, _source) {
  try {
    if (!Dispatcher || typeof Dispatcher.dispatch !== "function") return;
    const prepared = {
      ...message,
      state: "SENT", flags: message.flags || 0, blocked: false,
      pinned: false, tts: false, mention_everyone: false,
      mentions: [], mention_roles: [], reactions: [],
      attachments: [], embeds: [],
    };
    Dispatcher.dispatch({
      type: "MESSAGE_CREATE", channelId, message: prepared,
      optimistic: false, isFakeHiddenDM: true, guildId: message.guild_id,
      isPushNotification: false, suppressNotifications: true,
      suppressEmbeds: false, isRead: true, isAcknowledged: true, silent: true,
    });
    Dispatcher.dispatch({
      type: "MESSAGE_ACK", channelId, messageId: message.id, readState: "READ",
    });
  } catch (e) { console.error("[HiddenDM] injectFakeMessage error:", e); }
}

function preloadFakeMessages() {
  try {
    const all = getFakeMessages();
    for (const channelId of Object.keys(all)) {
      const msgs = all[channelId];
      if (!Array.isArray(msgs)) continue;
      [...msgs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .forEach(msg => injectFakeMessage(channelId, msg, "preload"));
    }
  } catch (e) { console.error("[HiddenDM] preloadFakeMessages error:", e); }
}

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

function storeFakeMessage(channelId, messageObj) {
  const all = getFakeMessages();
  if (!all[channelId]) all[channelId] = [];
  all[channelId].push(messageObj);
  saveFakeMessages(all);
}

function buildFakeMessage({ channelId, authorId, content, replyToId }) {
  const author = UserStore?.getUser(authorId);
  const id = generateSnowflake();
  const msg = {
    id, channel_id: channelId, content,
    timestamp: new Date().toISOString(), edited_timestamp: null,
    tts: false, mention_everyone: false, mentions: [], mention_roles: [],
    attachments: [], embeds: [], reactions: [], pinned: false, type: 0, flags: 0,
    author: author
      ? { id: author.id, username: author.username, discriminator: author.discriminator,
          avatar: author.avatar, bot: author.bot || false,
          global_name: author.globalName || author.username }
      : { id: authorId, username: "Unknown User", discriminator: "0000", avatar: null, bot: false },
  };
  if (replyToId) {
    const replyMsg = MessageStore?.getMessage(channelId, replyToId) ||
      getFakeMessages()[channelId]?.find(m => m.id === replyToId);
    if (replyMsg) {
      msg.type = 19;
      msg.message_reference = { channel_id: channelId, message_id: replyToId };
      msg.referenced_message = replyMsg;
    }
  }
  return msg;
}

const registeredCommands = [];

function buildCommands() {
  return [
    {
      id: "hiddendm_dm", name: "dm", displayName: "dm",
      description: "Fake a DM convo between 2 people",
      displayDescription: "Fake a DM convo between 2 people",
      options: [
        { name: "targ", displayName: "targ", description: "The other person (sends odd msgs)", displayDescription: "The other person (sends odd msgs)", type: 6, required: true },
        { name: "you", displayName: "you", description: "You (sends even msgs)", displayDescription: "You (sends even msgs)", type: 6, required: true },
        { name: "messages", displayName: "messages", description: "All messages separated by | (e.g. hey | whats up | nm)", displayDescription: "All messages separated by | (e.g. hey | whats up | nm)", type: 3, required: true },
      ],
      execute(args, ctx) {
        try {
          const targ = args.find(a => a.name === "targ")?.value;
          const you = args.find(a => a.name === "you")?.value;
          const raw = args.find(a => a.name === "messages")?.value;
          const channelId = ctx.channel.id;
          if (!targ || !you || !raw) { showToast("Missing arguments.", getAssetIDByName("Small")); return; }
          const messages = raw.split("|").map(m => m.trim()).filter(m => m.length > 0);
          if (messages.length === 0) { showToast("No messages found. Separate them with |", getAssetIDByName("Small")); return; }

          const now = Date.now();
          const firstMsgTime = now - 86400000 - 28800000 + Math.floor(Math.random() * 57600000);
          const timestamps = [firstMsgTime];
          for (let i = 1; i < messages.length; i++) {
            timestamps.push(timestamps[i - 1] + 30000 + Math.floor(Math.random() * 270000));
          }

          let injected = 0;
          for (let i = 0; i < messages.length; i++) {
            const authorId = i % 2 === 0 ? targ : you;
            const msg = buildFakeMessage({ channelId, authorId, content: messages[i] });
            msg.timestamp = new Date(timestamps[i]).toISOString();
            storeFakeMessage(channelId, msg);
            injectFakeMessage(channelId, msg, "command_dm");
            injected++;
          }
          clearUnreadStates();
          showToast(`Injected ${injected} message(s).`, getAssetIDByName("Check"));
        } catch (e) { console.error("[HiddenDM] /dm error:", e); showToast("Failed to create conversation.", getAssetIDByName("Small")); }
      },
    },
    {
      id: "hiddendm_clear", name: "hiddendm_clear", displayName: "hiddendm_clear",
      description: "Clear all fake messages stored for this channel",
      displayDescription: "Clear all fake messages stored for this channel",
      options: [],
      execute(_args, ctx) {
        try {
          const all = getFakeMessages();
          const channelId = ctx.channel.id;
          const count = all[channelId]?.length || 0;
          delete all[channelId];
          saveFakeMessages(all);
          showToast(`Cleared ${count} fake message(s) from this channel.`, getAssetIDByName("Trash"));
        } catch (e) { console.error("[HiddenDM] /hiddendm_clear error:", e); }
      },
    },
  ];
}

let dispatcherUnsubscribes = [];

export default {
  onLoad() {
    const cmds = buildCommands();
    for (const cmd of cmds) {
      try {
        registerCommand(cmd);
        registeredCommands.push(cmd.id);
      } catch (e) { console.error(`[HiddenDM] Failed to register command ${cmd.name}:`, e); }
    }

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
      "LOAD_MESSAGES_SUCCESS", "LOAD_MESSAGES_AROUND_SUCCESS",
      "LOAD_MESSAGES_SUCCESS_CACHED", "JUMP_TO_MESSAGE",
    ];
    for (const event of events) {
      Dispatcher?.subscribe(event, handleLoad);
      dispatcherUnsubscribes.push(() => Dispatcher?.unsubscribe(event, handleLoad));
    }
    preloadFakeMessages();
  },

  onUnload() {
    for (const id of registeredCommands) { try { unregisterCommand(id); } catch {} }
    registeredCommands.length = 0;
    for (const unsub of dispatcherUnsubscribes) unsub();
    dispatcherUnsubscribes = [];
  },
};
