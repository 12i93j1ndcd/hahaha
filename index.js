// HiddenDM - Rewritten for Kettu
// Original by dylan, ported to Kettu

const { findByProps } = vendetta.metro;
const { React, ReactNative: RN } = vendetta.metro.common;
const { registerCommand, unregisterCommand } = vendetta.commands;
const { storage } = vendetta.plugin;
const { showToast } = vendetta.ui.toasts;
const { getAssetIDByName } = vendetta.ui.assets;
const { Forms } = vendetta.ui.components;

const { ScrollView, View, Text, TouchableOpacity, StyleSheet } = RN;
const { FormSection, FormRow } = Forms;

const Dispatcher   = findByProps("_currentDispatchActionType", "_subscriptions");
const MessageStore = findByProps("getMessage", "getMessages");
const UserStore    = findByProps("getUser", "getUsers");
const ReadStateStore = findByProps("getAllReadStates");
const BulkAck      = findByProps("bulkAck");
const Linking      = findByProps("openURL");

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

function injectFakeMessage(channelId, message) {
  try {
    if (!Dispatcher || typeof Dispatcher.dispatch !== "function") return;
    var prepared = Object.assign({}, message, {
      state: "SENT", flags: message.flags || 0, blocked: false,
      pinned: false, tts: false, mention_everyone: false,
      mentions: [], mention_roles: [], reactions: [],
      attachments: [], embeds: [],
    });
    Dispatcher.dispatch({
      type: "MESSAGE_CREATE", channelId: channelId, message: prepared,
      optimistic: false, isFakeHiddenDM: true, guildId: message.guild_id,
      isPushNotification: false, suppressNotifications: true,
      suppressEmbeds: false, isRead: true, isAcknowledged: true, silent: true,
    });
    Dispatcher.dispatch({
      type: "MESSAGE_ACK", channelId: channelId,
      messageId: message.id, readState: "READ",
    });
  } catch (e) { console.error("[HiddenDM] injectFakeMessage error:", e); }
}

function preloadFakeMessages() {
  try {
    var all = getFakeMessages();
    var channelIds = Object.keys(all);
    for (var c = 0; c < channelIds.length; c++) {
      var channelId = channelIds[c];
      var msgs = all[channelId];
      if (!Array.isArray(msgs)) continue;
      msgs.slice().sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); })
        .forEach(function(msg) { injectFakeMessage(channelId, msg); });
    }
  } catch (e) { console.error("[HiddenDM] preloadFakeMessages error:", e); }
}

function clearUnreadStates() {
  try {
    if (!ReadStateStore || !ReadStateStore.getAllReadStates || !BulkAck || !BulkAck.bulkAck) return;
    var unread = ReadStateStore.getAllReadStates().filter(function(s) {
      return ReadStateStore.hasUnread && ReadStateStore.hasUnread(s.channelId);
    });
    if (unread.length === 0) return;
    BulkAck.bulkAck(unread.map(function(s) {
      return { channelId: s.channelId, messageId: s._lastMessageId || s.lastMessageId };
    }));
  } catch {}
}

function storeFakeMessage(channelId, messageObj) {
  var all = getFakeMessages();
  if (!all[channelId]) all[channelId] = [];
  all[channelId].push(messageObj);
  saveFakeMessages(all);
}

function buildFakeMessage(opts) {
  var channelId = opts.channelId, authorId = opts.authorId, content = opts.content;
  var author = UserStore && UserStore.getUser ? UserStore.getUser(authorId) : null;
  var id = generateSnowflake();
  var msg = {
    id: id, channel_id: channelId, content: content,
    timestamp: new Date().toISOString(), edited_timestamp: null,
    tts: false, mention_everyone: false, mentions: [], mention_roles: [],
    attachments: [], embeds: [], reactions: [], pinned: false, type: 0, flags: 0,
    author: author ? {
      id: author.id, username: author.username,
      discriminator: author.discriminator, avatar: author.avatar,
      bot: author.bot || false, global_name: author.globalName || author.username,
    } : { id: authorId, username: "Unknown User", discriminator: "0000", avatar: null, bot: false },
  };
  return msg;
}

var registeredCommands = [];

function buildCommands() {
  return [
    {
      id: "hiddendm_dm", name: "dm", displayName: "dm",
      description: "Fake a DM convo between 2 people",
      displayDescription: "Fake a DM convo between 2 people",
      options: [
        { name: "targ", displayName: "targ", description: "The other person (sends odd messages)", displayDescription: "The other person (sends odd messages)", type: 6, required: true },
        { name: "you", displayName: "you", description: "You (sends even messages)", displayDescription: "You (sends even messages)", type: 6, required: true },
        { name: "messages", displayName: "messages", description: "All messages separated by | (e.g. hey | whats up | nm)", displayDescription: "All messages separated by | (e.g. hey | whats up | nm)", type: 3, required: true },
      ],
      execute: function(args, ctx) {
        try {
          var targ = args.find(function(a) { return a.name === "targ"; });
          var you = args.find(function(a) { return a.name === "you"; });
          var raw = args.find(function(a) { return a.name === "messages"; });
          targ = targ ? targ.value : null;
          you = you ? you.value : null;
          raw = raw ? raw.value : null;
          var channelId = ctx.channel.id;

          if (!targ || !you || !raw) { showToast("Missing arguments.", getAssetIDByName("Small")); return; }

          var messages = raw.split("|").map(function(m) { return m.trim(); }).filter(function(m) { return m.length > 0; });
          if (messages.length === 0) { showToast("No messages found. Separate with |", getAssetIDByName("Small")); return; }

          var now = Date.now();
          var yesterdayStart = now - 86400000;
          var randomOffset = Math.floor(Math.random() * 57600000);
          var firstMsgTime = yesterdayStart - 28800000 + randomOffset;

          var timestamps = [firstMsgTime];
          for (var i = 1; i < messages.length; i++) {
            var gap = 30000 + Math.floor(Math.random() * 270000);
            timestamps.push(timestamps[i - 1] + gap);
          }

          var injected = 0;
          for (var j = 0; j < messages.length; j++) {
            var authorId = j % 2 === 0 ? targ : you;
            var msg = buildFakeMessage({ channelId: channelId, authorId: authorId, content: messages[j] });
            msg.timestamp = new Date(timestamps[j]).toISOString();
            storeFakeMessage(channelId, msg);
            injectFakeMessage(channelId, msg);
            injected++;
          }
          clearUnreadStates();
          showToast("Injected " + injected + " message(s).", getAssetIDByName("Check"));
        } catch (e) { console.error("[HiddenDM] /dm error:", e); showToast("Failed.", getAssetIDByName("Small")); }
      },
    },
    {
      id: "hiddendm_clear", name: "hiddendm_clear", displayName: "hiddendm_clear",
      description: "Clear all fake messages in this channel",
      displayDescription: "Clear all fake messages in this channel",
      options: [],
      execute: function(_args, ctx) {
        try {
          var all = getFakeMessages();
          var channelId = ctx.channel.id;
          var count = all[channelId] ? all[channelId].length : 0;
          delete all[channelId];
          saveFakeMessages(all);
          showToast("Cleared " + count + " fake message(s).", getAssetIDByName("Trash"));
        } catch (e) { console.error("[HiddenDM] /clear error:", e); }
      },
    },
  ];
}

var dispatcherUnsubscribes = [];

module.exports.onLoad = function() {
  var cmds = buildCommands();
  for (var i = 0; i < cmds.length; i++) {
    try {
      registerCommand(cmds[i]);
      registeredCommands.push(cmds[i].id);
    } catch (e) { console.error("[HiddenDM] Failed to register command:", e); }
  }

  var handleLoad = function(evt) {
    var channelId = evt && evt.channelId;
    if (!channelId) return;
    var stored = getFakeMessages()[channelId];
    if (!stored || stored.length === 0) return;
    var existing = MessageStore && MessageStore.getMessages ? MessageStore.getMessages(channelId) : null;
    var existingIds = {};
    if (existing && existing.toArray) {
      existing.toArray().forEach(function(m) { existingIds[m.id] = true; });
    }
    stored.filter(function(m) { return !existingIds[m.id]; })
      .sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); })
      .forEach(function(m) { injectFakeMessage(channelId, m); });
  };

  var events = ["LOAD_MESSAGES_SUCCESS", "LOAD_MESSAGES_AROUND_SUCCESS", "LOAD_MESSAGES_SUCCESS_CACHED", "JUMP_TO_MESSAGE"];
  for (var e = 0; e < events.length; e++) {
    if (Dispatcher && Dispatcher.subscribe) {
      Dispatcher.subscribe(events[e], handleLoad);
      dispatcherUnsubscribes.push((function(ev) { return function() { Dispatcher.unsubscribe(ev, handleLoad); }; })(events[e]));
    }
  }
  preloadFakeMessages();
};

module.exports.onUnload = function() {
  for (var i = 0; i < registeredCommands.length; i++) {
    try { unregisterCommand(registeredCommands[i]); } catch {}
  }
  registeredCommands.length = 0;
  for (var j = 0; j < dispatcherUnsubscribes.length; j++) dispatcherUnsubscribes[j]();
  dispatcherUnsubscribes = [];
};
