({
  onLoad() {
    const { findByProps } = vendetta.metro;
    const { storage } = vendetta.plugin;
    const { registerCommand, unregisterCommand } = vendetta.commands;
    const { showToast } = vendetta.ui.toasts;
    const { getAssetIDByName } = vendetta.ui.assets;

    const Dispatcher = findByProps("_currentDispatchActionType", "_subscriptions");
    const MessageStore = findByProps("getMessage", "getMessages");
    const UserStore = findByProps("getUser", "getUsers");
    const ReadStateStore = findByProps("getAllReadStates");
    const BulkAck = findByProps("bulkAck");

    function getFakeMessages() {
      try { var r = storage.fakeMessages; if (!r) return {}; return typeof r === "string" ? JSON.parse(r) : r; } catch(e) { return {}; }
    }
    function saveFakeMessages(d) { try { storage.fakeMessages = JSON.stringify(d); } catch(e) {} }
    function generateSnowflake() { return ((Date.now() - 1420070400000) * 4194304).toString(); }

    function injectFakeMessage(chId, msg) {
      try {
        if (!Dispatcher || typeof Dispatcher.dispatch !== "function") return;
        Dispatcher.dispatch({
          type: "MESSAGE_CREATE", channelId: chId,
          message: Object.assign({}, msg, { state: "SENT", flags: msg.flags || 0, blocked: false, pinned: false, tts: false, mention_everyone: false, mentions: [], mention_roles: [], reactions: [], attachments: [], embeds: [] }),
          optimistic: false, isFakeHiddenDM: true, isPushNotification: false, suppressNotifications: true, suppressEmbeds: false, isRead: true, isAcknowledged: true, silent: true
        });
        Dispatcher.dispatch({ type: "MESSAGE_ACK", channelId: chId, messageId: msg.id, readState: "READ" });
      } catch(e) {}
    }

    function clearUnreadStates() {
      try {
        if (!ReadStateStore || !ReadStateStore.getAllReadStates || !BulkAck || !BulkAck.bulkAck) return;
        var unread = ReadStateStore.getAllReadStates().filter(function(s) { return ReadStateStore.hasUnread && ReadStateStore.hasUnread(s.channelId); });
        if (unread.length === 0) return;
        BulkAck.bulkAck(unread.map(function(s) { return { channelId: s.channelId, messageId: s._lastMessageId || s.lastMessageId }; }));
      } catch(e) {}
    }

    function storeFakeMessage(chId, m) { var all = getFakeMessages(); if (!all[chId]) all[chId] = []; all[chId].push(m); saveFakeMessages(all); }

    function buildFakeMessage(chId, authId, content) {
      var author = UserStore && UserStore.getUser ? UserStore.getUser(authId) : null;
      var id = generateSnowflake();
      return {
        id: id, channel_id: chId, content: content, timestamp: new Date().toISOString(), edited_timestamp: null,
        tts: false, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], reactions: [], pinned: false, type: 0, flags: 0,
        author: author ? { id: author.id, username: author.username, discriminator: author.discriminator, avatar: author.avatar, bot: author.bot || false, global_name: author.globalName || author.username }
          : { id: authId, username: "Unknown User", discriminator: "0000", avatar: null, bot: false }
      };
    }

    // preload stored messages
    var allStored = getFakeMessages();
    Object.keys(allStored).forEach(function(chId) {
      var msgs = allStored[chId];
      if (!Array.isArray(msgs)) return;
      msgs.slice().sort(function(a,b) { return new Date(a.timestamp) - new Date(b.timestamp); })
        .forEach(function(m) { injectFakeMessage(chId, m); });
    });

    this._cmds = [];
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
            var msgs = raw.split("|");
            var cleaned = [];
            for (var m = 0; m < msgs.length; m++) { var t = msgs[m].replace(/^\s+|\s+$/g, ""); if (t.length > 0) cleaned.push(t); }
            if (cleaned.length === 0) { showToast("No messages. Separate with |", getAssetIDByName("Small")); return; }

            var now = Date.now();
            var firstTime = now - 86400000 - 28800000 + Math.floor(Math.random() * 57600000);
            var timestamps = [firstTime];
            for (var i = 1; i < cleaned.length; i++) { timestamps.push(timestamps[i-1] + 30000 + Math.floor(Math.random() * 270000)); }

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
        description: "Clear all fake messages in this channel", displayDescription: "Clear all fake messages in this channel",
        options: [],
        execute: function(args, ctx) {
          try { var all = getFakeMessages(); var chId = ctx.channel.id; var c = all[chId] ? all[chId].length : 0; delete all[chId]; saveFakeMessages(all); showToast("Cleared " + c + " fake message(s).", getAssetIDByName("Trash")); } catch(e) {}
        }
      }
    ];

    var self = this;
    for (var i = 0; i < cmds.length; i++) { try { registerCommand(cmds[i]); self._cmds.push(cmds[i].id); } catch(e) {} }

    this._unsubs = [];
    var handleLoad = function(evt) {
      var chId = evt && evt.channelId; if (!chId) return;
      var stored = getFakeMessages()[chId]; if (!stored || stored.length === 0) return;
      var existing = MessageStore && MessageStore.getMessages ? MessageStore.getMessages(chId) : null;
      var ids = {};
      if (existing && existing.toArray) existing.toArray().forEach(function(m) { ids[m.id] = true; });
      stored.filter(function(m) { return !ids[m.id]; }).sort(function(a,b) { return new Date(a.timestamp) - new Date(b.timestamp); }).forEach(function(m) { injectFakeMessage(chId, m); });
    };
    var events = ["LOAD_MESSAGES_SUCCESS","LOAD_MESSAGES_AROUND_SUCCESS","LOAD_MESSAGES_SUCCESS_CACHED","JUMP_TO_MESSAGE"];
    for (var e = 0; e < events.length; e++) {
      if (Dispatcher && Dispatcher.subscribe) {
        Dispatcher.subscribe(events[e], handleLoad);
        this._unsubs.push((function(ev) { return function() { Dispatcher.unsubscribe(ev, handleLoad); }; })(events[e]));
      }
    }
  },

  onUnload() {
    var unregisterCommand = vendetta.commands.unregisterCommand;
    if (this._cmds) { for (var i = 0; i < this._cmds.length; i++) { try { unregisterCommand(this._cmds[i]); } catch(e) {} } }
    if (this._unsubs) { for (var j = 0; j < this._unsubs.length; j++) { this._unsubs[j](); } }
  }
})
