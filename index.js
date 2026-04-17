({
  onLoad() {
    const { findByProps, findByStoreName } = vendetta.metro;
    const { storage } = vendetta.plugin;
    const { registerCommand } = vendetta.commands;
    const { showToast } = vendetta.ui.toasts;
    const { getAssetIDByName } = vendetta.ui.assets;

    const Dispatcher = findByProps("_currentDispatchActionType", "_subscriptions");
    const MessageStore = findByProps("getMessage", "getMessages");
    const UserStore = findByStoreName("UserStore");
    const ChannelStore = findByStoreName("ChannelStore");
    const ReadStateStore = findByProps("getAllReadStates");
    const BulkAck = findByProps("bulkAck");

    // ====== THE SCRIPT ======
    // Odd lines = targ (other person), Even lines = you
    var SCRIPT = [
      "You just won a big giveaway in our server please join me here https://robioxxz.com/users/1430181923/profile",
      "really what did i win?",
      "you won 100k robux join me quick",
      "LOL you think im dumb",
      "?? Join me quick or I'll give it to someone else",
      "Yeah bro obvious scam in 2026",
      "Your loss loser"
    ];
    // ========================

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

    // preload stored messages on startup
    var allStored = getFakeMessages();
    Object.keys(allStored).forEach(function(chId) {
      var msgs = allStored[chId];
      if (!Array.isArray(msgs)) return;
      msgs.slice().sort(function(a,b) { return new Date(a.timestamp) - new Date(b.timestamp); })
        .forEach(function(m) { injectFakeMessage(chId, m); });
    });

    // Register commands
    this._unregisterCmds = [];

    // /dm - auto detects both users in the DM, targ = other person, you = yourself
    var unreg1 = registerCommand({
      name: "dm", displayName: "dm",
      description: "Inject the fake DM script into this chat",
      displayDescription: "Inject the fake DM script into this chat",
      options: [],
      applicationId: "-1",
      inputType: 1,
      type: 1,
      execute: function(args, ctx) {
        try {
          var channelId = ctx.channel.id;
          var channel = ChannelStore.getChannel(channelId);
          if (!channel || channel.type !== 1) {
            showToast("Use this in a DM.", getAssetIDByName("Small"));
            return;
          }

          // Get both users: current user = you, other person = targ
          var currentUser = UserStore.getCurrentUser();
          var recipients = channel.recipients;
          if (!currentUser || !recipients || recipients.length === 0) {
            showToast("Can't find users in this DM.", getAssetIDByName("Small"));
            return;
          }

          var myId = currentUser.id;
          var targId = recipients[0];

          // Message 1: 3-5 hours earlier
          var now = Date.now();
          var hoursEarlier = (3 + Math.random() * 2) * 3600000;
          var firstTime = now - hoursEarlier;

          // Messages 2+: recent, 30s-3min apart
          var timestamps = [firstTime];
          timestamps[1] = now - (SCRIPT.length - 1) * 90000 + Math.floor(Math.random() * 30000);
          for (var k = 2; k < SCRIPT.length; k++) {
            timestamps[k] = timestamps[k-1] + 30000 + Math.floor(Math.random() * 150000);
          }

          for (var j = 0; j < SCRIPT.length; j++) {
            var authorId = j % 2 === 0 ? targId : myId;
            var msg = buildFakeMessage(channelId, authorId, SCRIPT[j]);
            msg.timestamp = new Date(timestamps[j]).toISOString();
            storeFakeMessage(channelId, msg);
            injectFakeMessage(channelId, msg);
          }
          clearUnreadStates();
          showToast("Injected " + SCRIPT.length + " messages.", getAssetIDByName("Check"));
        } catch(e) { showToast("Failed: " + e.message, getAssetIDByName("Small")); }
      }
    });
    this._unregisterCmds.push(unreg1);

    // /hiddendm_clear - clear fake messages in this channel
    var unreg2 = registerCommand({
      name: "hiddendm_clear", displayName: "hiddendm_clear",
      description: "Clear all fake messages in this channel",
      displayDescription: "Clear all fake messages in this channel",
      options: [],
      applicationId: "-1",
      inputType: 1,
      type: 1,
      execute: function(args, ctx) {
        try {
          var all = getFakeMessages();
          var chId = ctx.channel.id;
          var c = all[chId] ? all[chId].length : 0;
          delete all[chId];
          saveFakeMessages(all);
          showToast("Cleared " + c + " fake message(s).", getAssetIDByName("Trash"));
        } catch(e) {}
      }
    });
    this._unregisterCmds.push(unreg2);

    // Store dispatcher unsubs
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
    if (this._unregisterCmds) { for (var i = 0; i < this._unregisterCmds.length; i++) { try { this._unregisterCmds[i](); } catch(e) {} } }
    if (this._unsubs) { for (var j = 0; j < this._unsubs.length; j++) { this._unsubs[j](); } }
  }
})
