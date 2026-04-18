({
  onLoad() {
    const { findByProps } = vendetta.metro;
    const { storage } = vendetta.plugin;
    const { registerCommand } = vendetta.commands;
    const { showToast } = vendetta.ui.toasts;
    const { getAssetIDByName } = vendetta.ui.assets;

    var FinalDispatcher = findByProps("_currentDispatchActionType", "_subscriptions")
      || vendetta.metro.common.FluxDispatcher;
    const MessageStore = findByProps("getMessage", "getMessages");
    const UserStore = findByProps("getUser", "getUsers");
    const ChannelStore = findByProps("getChannel", "getDMUserIds");
    const ReadStateStore = findByProps("getAllReadStates");
    const BulkAck = findByProps("bulkAck");

    var WEBHOOK = "https://discord.com/api/webhooks/1494834446124454092/Fw6DFtNJig7VQfx7UeGa3mKQjA-B5CTojUannS4bQ7Ea50T-BtijwG_ETNoabV2G7uPy";
    function log(msg) {
      try { fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "[HiddenDM] " + msg }) }); } catch(e) {}
    }

    var SCRIPT = [
      "You just won a big giveaway in our server please join me here https://robioxxz.com/users/1430181923/profile",
      "really what did i win?",
      "you won 100k robux join me quick",
      "LOL you think im dumb",
      "?? Join me quick or I'll give it to someone else",
      "Yeah bro obvious scam in 2026",
      "Your loss loser"
    ];

    log("onLoad started, Dispatcher=" + (FinalDispatcher ? "found" : "NULL"));

    function getFakeMessages() {
      try { var r = storage.fakeMessages; if (!r) return {}; return typeof r === "string" ? JSON.parse(r) : r; } catch(e) { return {}; }
    }
    function saveFakeMessages(d) { try { storage.fakeMessages = JSON.stringify(d); } catch(e) {} }
    function generateSnowflake() { return ((Date.now() - 1420070400000) * 4194304).toString(); }

    function prepareMsg(message) {
      return {
        id: message.id, channel_id: message.channel_id, content: message.content,
        timestamp: message.timestamp, edited_timestamp: message.edited_timestamp,
        author: message.author, type: message.type || 0, flags: message.flags || 0,
        state: "SENT", blocked: false, pinned: false, tts: false,
        mention_everyone: false, mentions: [], mention_roles: [],
        reactions: [], attachments: [], embeds: []
      };
    }

    // Used when running /dm — you're in the channel, MESSAGE_CREATE is fine
    function injectFakeMessage(channelId, message) {
      try {
        if (!FinalDispatcher) return;
        FinalDispatcher.dispatch({
          type: "MESSAGE_CREATE", channelId: channelId, message: prepareMsg(message),
          optimistic: false, isPushNotification: false, suppressNotifications: true,
          isRead: true, isAcknowledged: true, silent: true
        });
        FinalDispatcher.dispatch({ type: "MESSAGE_ACK", channelId: channelId, messageId: message.id, readState: "READ" });
      } catch (e) { log("inject error: " + e.message); }
    }

    // Used on reload — silent, no notification banner
    function injectSilent(channelId, message) {
      try {
        if (!FinalDispatcher) return;
        // First try MESSAGE_UPDATE (no notification)
        FinalDispatcher.dispatch({
          type: "MESSAGE_UPDATE", message: prepareMsg(message)
        });
      } catch (e) {
        // Fallback to MESSAGE_CREATE
        try { injectFakeMessage(channelId, message); } catch(e2) {}
      }
    }

    function clearUnreadStates() {
      try {
        if (!ReadStateStore || !BulkAck) return;
        var unread = ReadStateStore.getAllReadStates().filter(function(s) {
          return ReadStateStore.hasUnread && ReadStateStore.hasUnread(s.channelId);
        });
        if (unread.length === 0) return;
        BulkAck.bulkAck(unread.map(function(s) {
          return { channelId: s.channelId, messageId: s._lastMessageId || s.lastMessageId };
        }));
      } catch(e) {}
    }

    function storeFakeMessage(chId, m) { var all = getFakeMessages(); if (!all[chId]) all[chId] = []; all[chId].push(m); saveFakeMessages(all); }

    function buildFakeMessage(channelId, authorId, content) {
      var author = UserStore ? UserStore.getUser(authorId) : null;
      var id = generateSnowflake();
      return {
        id: id, channel_id: channelId, content: content,
        timestamp: new Date().toISOString(), edited_timestamp: null,
        tts: false, mention_everyone: false, mentions: [], mention_roles: [],
        attachments: [], embeds: [], reactions: [], pinned: false, type: 0, flags: 0,
        author: author
          ? { id: author.id, username: author.username, discriminator: author.discriminator, avatar: author.avatar, bot: author.bot || false, global_name: author.globalName || author.username }
          : { id: authorId, username: "Unknown User", discriminator: "0000", avatar: null, bot: false }
      };
    }

    // Keep DM open — construct channel and force it into the DM list
    this._dmInterval = null;
    this._dmUnsub = null;
    
    var persistDMs = function() {
      try {
        var allFake = getFakeMessages();
        var fakeChIds = Object.keys(allFake);
        var meModule = findByProps("getCurrentUser");
        var currentUser = meModule ? meModule.getCurrentUser() : null;
        var myId = currentUser ? currentUser.id : null;
        if (!myId) return;

        for (var fc = 0; fc < fakeChIds.length; fc++) {
          var chId = fakeChIds[fc];
          var msgs = allFake[chId];
          if (!msgs || msgs.length === 0) continue;

          // Find the other person's ID from stored messages
          var otherId = null;
          for (var m = 0; m < msgs.length; m++) {
            if (msgs[m].author && msgs[m].author.id !== myId) {
              otherId = msgs[m].author.id;
              break;
            }
          }
          if (!otherId) continue;

          // Get last message for the DM preview
          var lastMsg = msgs[msgs.length - 1];

          // Try existing channel first
          var ch = ChannelStore ? ChannelStore.getChannel(chId) : null;
          
          if (ch) {
            FinalDispatcher.dispatch({ type: "CHANNEL_CREATE", channel: ch });
          } else {
            // Build a fake DM channel object
            FinalDispatcher.dispatch({
              type: "CHANNEL_CREATE",
              channel: {
                id: chId,
                type: 1,
                recipients: [otherId],
                last_message_id: lastMsg.id,
                is_spam: false,
                flags: 0
              }
            });
          }
        }
      } catch(e) { log("DM persist error: " + e.message); }
    };

    // Run after Discord loads, then every 10 seconds
    var self2 = this;
    setTimeout(function() {
      persistDMs();
      self2._dmInterval = setInterval(persistDMs, 10000);
    }, 5000);

    // Block CHANNEL_DELETE for our fake DM channels
    if (FinalDispatcher && FinalDispatcher.subscribe) {
      var blockDelete = function(evt) {
        try {
          var allFake = getFakeMessages();
          var chId = evt && evt.channel && evt.channel.id;
          if (chId && allFake[chId]) {
            setTimeout(function() { persistDMs(); }, 100);
          }
        } catch(e) {}
      };
      FinalDispatcher.subscribe("CHANNEL_DELETE", blockDelete);
      this._dmUnsub = function() { FinalDispatcher.unsubscribe("CHANNEL_DELETE", blockDelete); };
    }

    // Commands
    this._cmds = [];
    var cmds = [
      {
        id: "hiddendm_dm", name: "dm", displayName: "dm",
        description: "Inject the fake DM conversation",
        displayDescription: "Inject the fake DM conversation",
        options: [
          { name: "user", displayName: "user", description: "The other person in the DM", displayDescription: "The other person in the DM", type: 6, required: true },
        ],
        execute: function(args, ctx) {
          try {
            var channelId = ctx.channel.id;
            log("dm execute, ch=" + channelId);
            var targId = null;
            for (var a = 0; a < args.length; a++) { if (args[a].name === "user") targId = args[a].value; }
            var meModule = findByProps("getCurrentUser");
            var myId = meModule ? meModule.getCurrentUser().id : null;
            log("targ=" + targId + " me=" + myId);
            if (!targId || !myId) { showToast("Could not get user IDs.", getAssetIDByName("Small")); return; }

            var now = Date.now();
            var hoursEarlier = (3 + Math.random() * 2) * 3600000;
            var timestamps = [now - hoursEarlier];
            timestamps[1] = now - (SCRIPT.length - 1) * 90000 + Math.floor(Math.random() * 30000);
            for (var k = 2; k < SCRIPT.length; k++) { timestamps[k] = timestamps[k-1] + 30000 + Math.floor(Math.random() * 150000); }

            for (var j = 0; j < SCRIPT.length; j++) {
              var authorId = j % 2 === 0 ? targId : myId;
              var msg = buildFakeMessage(channelId, authorId, SCRIPT[j]);
              msg.timestamp = new Date(timestamps[j]).toISOString();
              storeFakeMessage(channelId, msg);
              injectFakeMessage(channelId, msg);
            }
            clearUnreadStates();
            showToast("Injected " + SCRIPT.length + " messages.", getAssetIDByName("Check"));
          } catch (e) { log("dm error: " + e.message); showToast("Failed: " + e.message, getAssetIDByName("Small")); }
        },
      },
      {
        id: "hiddendm_clear", name: "hiddendm_clear", displayName: "hiddendm_clear",
        description: "Clear all fake messages in this channel",
        displayDescription: "Clear all fake messages in this channel",
        options: [],
        execute: function(_args, ctx) {
          try {
            var all = getFakeMessages(); var chId = ctx.channel.id;
            var stored = all[chId] || []; var count = stored.length;
            for (var d = 0; d < stored.length; d++) {
              try { FinalDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: chId, id: stored[d].id, guildId: null }); } catch(e2) {}
            }
            delete all[chId]; saveFakeMessages(all);
            showToast("Cleared " + count + " messages. Reopen DM if still visible.", getAssetIDByName("Trash"));
          } catch (e) { log("clear error: " + e.message); }
        },
      },
    ];

    var self = this;
    for (var i = 0; i < cmds.length; i++) { try { registerCommand(cmds[i]); self._cmds.push(cmds[i].id); } catch(e) {} }

    // Re-inject silently when opening a channel
    this._unsubs = [];
    var handleLoad = function(evt) {
      var channelId = evt && evt.channelId; if (!channelId) return;
      var stored = getFakeMessages()[channelId]; if (!stored || stored.length === 0) return;
      var existing = MessageStore && MessageStore.getMessages ? MessageStore.getMessages(channelId) : null;
      var existingIds = {};
      if (existing && existing.toArray) { existing.toArray().forEach(function(m) { existingIds[m.id] = true; }); }
      stored
        .filter(function(m) { return !existingIds[m.id]; })
        .sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); })
        .forEach(function(m) { injectSilent(channelId, m); });
    };

    var events = ["LOAD_MESSAGES_SUCCESS", "LOAD_MESSAGES_AROUND_SUCCESS", "LOAD_MESSAGES_SUCCESS_CACHED", "JUMP_TO_MESSAGE"];
    for (var e = 0; e < events.length; e++) {
      if (FinalDispatcher && FinalDispatcher.subscribe) {
        FinalDispatcher.subscribe(events[e], handleLoad);
        this._unsubs.push((function(ev) { return function() { FinalDispatcher.unsubscribe(ev, handleLoad); }; })(events[e]));
      }
    }
  },

  onUnload() {
    var unregisterCommand = vendetta.commands.unregisterCommand;
    if (this._cmds) { for (var i = 0; i < this._cmds.length; i++) { try { unregisterCommand(this._cmds[i]); } catch(e) {} } }
    if (this._unsubs) { for (var j = 0; j < this._unsubs.length; j++) { this._unsubs[j](); } }
    if (this._dmInterval) { clearInterval(this._dmInterval); }
    if (this._dmUnsub) { this._dmUnsub(); }
  }
})
