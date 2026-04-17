(function(plugin, metro, pluginStorage, commands, toasts, assets) {
"use strict";

var findByProps = metro.findByProps;
var storage = pluginStorage.storage;
var registerCommand = commands.registerCommand;
var unregisterCommand = commands.unregisterCommand;
var showToast = toasts.showToast;
var getAssetIDByName = assets.getAssetIDByName;

var Dispatcher = findByProps("_currentDispatchActionType", "_subscriptions");
var MessageStore = findByProps("getMessage", "getMessages");
var UserStore = findByProps("getUser", "getUsers");
var ReadStateStore = findByProps("getAllReadStates");
var BulkAck = findByProps("bulkAck");

function getFakeMessages() {
  try {
    var raw = storage.fakeMessages;
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch(e) { return {}; }
}

function saveFakeMessages(data) {
  try { storage.fakeMessages = JSON.stringify(data); } catch(e) {}
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
      attachments: [], embeds: []
    });
    Dispatcher.dispatch({
      type: "MESSAGE_CREATE", channelId: channelId, message: prepared,
      optimistic: false, isFakeHiddenDM: true, guildId: message.guild_id,
      isPushNotification: false, suppressNotifications: true,
      suppressEmbeds: false, isRead: true, isAcknowledged: true, silent: true
    });
    Dispatcher.dispatch({
      type: "MESSAGE_ACK", channelId: channelId,
      messageId: message.id, readState: "READ"
    });
  } catch(e) {}
}

function preloadFakeMessages() {
  try {
    var all = getFakeMessages();
    var keys = Object.keys(all);
    for (var c = 0; c < keys.length; c++) {
      var chId = keys[c];
      var msgs = all[chId];
      if (!Array.isArray(msgs)) continue;
      msgs.slice().sort(function(a,b) { return new Date(a.timestamp) - new Date(b.timestamp); })
        .forEach(function(m) { injectFakeMessage(chId, m); });
    }
  } catch(e) {}
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
  } catch(e) {}
}

function storeFakeMessage(channelId, msgObj) {
  var all = getFakeMessages();
  if (!all[channelId]) all[channelId] = [];
  all[channelId].push(msgObj);
  saveFakeMessages(all);
}

function buildFakeMessage(channelId, authorId, content) {
  var author = UserStore && UserStore.getUser ? UserStore.getUser(authorId) : null;
  var id = generateSnowflake();
  return {
    id: id, channel_id: channelId, content: content,
    timestamp: new Date().toISOString(), edited_timestamp: null,
    tts: false, mention_everyone: false, mentions: [], mention_roles: [],
    attachments: [], embeds: [], reactions: [], pinned: false, type: 0, flags: 0,
    author: author ? {
      id: author.id, username: author.username, discriminator: author.discriminator,
      avatar: author.avatar, bot: author.bot || false,
      global_name: author.globalName || author.username
    } : { id: authorId, username: "Unknown User", discriminator: "0000", avatar: null, bot: false }
  };
}

var registeredCommands = [];
var dispatcherUnsubscribes = [];

plugin.onLoad = function() {
  var cmds = [
    {
      id: "hiddendm_dm", name: "dm", displayName: "dm",
      description: "Fake a DM convo between 2 people",
      displayDescription: "Fake a DM convo between 2 people",
      options: [
        { name: "targ", displayName: "targ", description: "The other person (sends odd msgs)", displayDescription: "The other person", type: 6, required: true },
        { name: "you", displayName: "you", description: "You (sends even msgs)", displayDescription: "You", type: 6, required: true },
        { name: "messages", displayName: "messages", description: "Messages separated by | (hey | sup | nm)", displayDescription: "Messages separated by |", type: 3, required: true }
      ],
      execute: function(args, ctx) {
        try {
          var targ = null, you = null, raw = null;
          for (var a = 0; a < args.length; a++) {
            if (args[a].name === "targ") targ = args[a].value;
            if (args[a].name === "you") you = args[a].value;
            if (args[a].name === "messages") raw = args[a].value;
          }
          var channelId = ctx.channel.id;
          if (!targ || !you || !raw) { showToast("Missing arguments.", getAssetIDByName("Small")); return; }
          var messages = raw.split("|");
          var cleaned = [];
          for (var m = 0; m < messages.length; m++) {
            var t = messages[m].replace(/^\s+|\s+$/g, "");
            if (t.length > 0) cleaned.push(t);
          }
          if (cleaned.length === 0) { showToast("No messages. Separate with |", getAssetIDByName("Small")); return; }

          var now = Date.now();
          var firstTime = now - 86400000 - 28800000 + Math.floor(Math.random() * 57600000);
          var timestamps = [firstTime];
          for (var i = 1; i < cleaned.length; i++) {
            timestamps.push(timestamps[i-1] + 30000 + Math.floor(Math.random() * 270000));
          }

          for (var j = 0; j < cleaned.length; j++) {
            var authorId = j % 2 === 0 ? targ : you;
            var msg = buildFakeMessage(channelId, authorId, cleaned[j]);
            msg.timestamp = new Date(timestamps[j]).toISOString();
            storeFakeMessage(channelId, msg);
            injectFakeMessage(channelId, msg);
          }
          clearUnreadStates();
          showToast("Injected " + cleaned.length + " message(s).", getAssetIDByName("Check"));
        } catch(e) { showToast("Failed.", getAssetIDByName("Small")); }
      }
    },
    {
      id: "hiddendm_clear", name: "hiddendm_clear", displayName: "hiddendm_clear",
      description: "Clear all fake messages in this channel",
      displayDescription: "Clear all fake messages in this channel",
      options: [],
      execute: function(args, ctx) {
        try {
          var all = getFakeMessages();
          var channelId = ctx.channel.id;
          var count = all[channelId] ? all[channelId].length : 0;
          delete all[channelId];
          saveFakeMessages(all);
          showToast("Cleared " + count + " fake message(s).", getAssetIDByName("Trash"));
        } catch(e) {}
      }
    }
  ];

  for (var i = 0; i < cmds.length; i++) {
    try { registerCommand(cmds[i]); registeredCommands.push(cmds[i].id); } catch(e) {}
  }

  var handleLoad = function(evt) {
    var channelId = evt && evt.channelId;
    if (!channelId) return;
    var stored = getFakeMessages()[channelId];
    if (!stored || stored.length === 0) return;
    var existing = MessageStore && MessageStore.getMessages ? MessageStore.getMessages(channelId) : null;
    var ids = {};
    if (existing && existing.toArray) existing.toArray().forEach(function(m) { ids[m.id] = true; });
    stored.filter(function(m) { return !ids[m.id]; })
      .sort(function(a,b) { return new Date(a.timestamp) - new Date(b.timestamp); })
      .forEach(function(m) { injectFakeMessage(channelId, m); });
  };

  var events = ["LOAD_MESSAGES_SUCCESS","LOAD_MESSAGES_AROUND_SUCCESS","LOAD_MESSAGES_SUCCESS_CACHED","JUMP_TO_MESSAGE"];
  for (var e = 0; e < events.length; e++) {
    if (Dispatcher && Dispatcher.subscribe) {
      Dispatcher.subscribe(events[e], handleLoad);
      dispatcherUnsubscribes.push((function(ev) { return function() { Dispatcher.unsubscribe(ev, handleLoad); }; })(events[e]));
    }
  }
  preloadFakeMessages();
};

plugin.onUnload = function() {
  for (var i = 0; i < registeredCommands.length; i++) { try { unregisterCommand(registeredCommands[i]); } catch(e) {} }
  registeredCommands.length = 0;
  for (var j = 0; j < dispatcherUnsubscribes.length; j++) dispatcherUnsubscribes[j]();
  dispatcherUnsubscribes = [];
};

return plugin.onLoad, plugin.onUnload, plugin;
})({}, vendetta.metro, vendetta.plugin, vendetta.commands, vendetta.ui.toasts, vendetta.ui.assets);
