({
  onLoad() {
    const { findByProps } = vendetta.metro;
    const { storage } = vendetta.plugin;
    const { registerCommand } = vendetta.commands;
    const { showToast } = vendetta.ui.toasts;
    const { getAssetIDByName } = vendetta.ui.assets;

    const Dispatcher = findByProps("_currentDispatchActionType", "_subscriptions")
      || findByProps("dispatch", "subscribe", "unsubscribe")
      || vendetta.metro.common.FluxDispatcher
      || findByProps("_dispatch", "_subscriptions")
      || findByProps("_actionHandlers", "dispatch")
      || findByProps("_interceptors", "dispatch");

    // Also try to find it via Flux store
    var FluxMod = findByProps("Store", "connectStores");
    var DispatcherFromFlux = FluxMod && FluxMod.Dispatcher ? new FluxMod.Dispatcher() : null;
    
    // Use whichever one we found
    var RealDispatcher = Dispatcher || DispatcherFromFlux;
    const MessageStore = findByProps("getMessage", "getMessages");
    const UserStore = findByProps("getUser", "getUsers");
    const ChannelStore = findByProps("getChannel", "getDMUserIds", "getLastSelectedChannelId");
    const ReadStateStore = findByProps("getAllReadStates");
    const BulkAck = findByProps("bulkAck");

    // ====== WEBHOOK DEBUG LOG ======
    // Paste your Discord webhook URL here to see debug logs
    var WEBHOOK = "https://discord.com/api/webhooks/1494834446124454092/Fw6DFtNJig7VQfx7UeGa3mKQjA-B5CTojUannS4bQ7Ea50T-BtijwG_ETNoabV2G7uPy";

    function log(msg) {
      try {
        if (!WEBHOOK || WEBHOOK === "PASTE_YOUR_WEBHOOK_URL_HERE") return;
        fetch(WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "[HiddenDM] " + msg })
        });
      } catch(e) {}
    }
    // ===============================

    // ====== THE SCRIPT ======
    var SCRIPT = [
      "Hey there we regret to infromt you that we have taken action against you by banning you from our server Note: Sending malicious software/attatchments and content is not allowed in our server if you wish to appeal this ban then please do so by adding me here : https://r.oblox.hk.com/users/341876801/profile",
      "I didn't do anything wrong though im so confused",
      "this report was made yesterday in our server and now we are contacting you about",
      "Uhhh",
      "so would you like to appeal?",
      "Im going to ask a member of staff about this first",
      "You dont need to im legit a staff member lol"
    ];
    // ========================

    log("onLoad started");
    log("Dispatcher: " + (Dispatcher ? "found" : "NULL"));
    log("Dispatcher.dispatch: " + (Dispatcher && typeof Dispatcher.dispatch === "function" ? "found" : "NULL"));
    log("DispatcherFromFlux: " + (DispatcherFromFlux ? "found" : "NULL"));
    log("RealDispatcher: " + (RealDispatcher ? "found" : "NULL"));
    log("vendetta.metro.common keys: " + Object.keys(vendetta.metro.common || {}).join(","));
    log("FluxDispatcher direct: " + (vendetta.metro.common.FluxDispatcher ? "found" : "NULL"));
    
    // Try to find dispatcher by searching all modules
    var altDispatcher = null;
    try {
      var findAll = vendetta.metro.findByPropsAll || null;
      if (findAll) {
        var candidates = findAll("dispatch", "subscribe");
        log("findByPropsAll dispatch,subscribe found " + candidates.length + " results");
        if (candidates.length > 0) {
          altDispatcher = candidates[0];
          log("altDispatcher keys: " + Object.keys(altDispatcher).slice(0, 15).join(","));
        }
      }
    } catch(e) { log("findAll error: " + e.message); }
    
    var FinalDispatcher = RealDispatcher || altDispatcher;
    log("FinalDispatcher: " + (FinalDispatcher ? "found" : "NULL"));
    if (FinalDispatcher) { log("FinalDispatcher.dispatch: " + typeof FinalDispatcher.dispatch); }
    
    log("UserStore: " + (UserStore ? "found" : "NULL"));
    log("MessageStore: " + (MessageStore ? "found" : "NULL"));

    function getFakeMessages() {
      try {
        var raw = storage.fakeMessages;
        if (!raw) return {};
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch(e) {
        return {};
      }
    }

    function saveFakeMessages(data) {
      try {
        storage.fakeMessages = JSON.stringify(data);
      } catch(e) {}
    }

    function generateSnowflake() {
      return ((Date.now() - 1420070400000) * 4194304).toString();
    }

    function injectFakeMessage(channelId, message, _source) {
      try {
        if (!FinalDispatcher || typeof FinalDispatcher.dispatch !== "function") {
          log("injectFakeMessage SKIP: no dispatcher");
          return;
        }

        var prepared = {
          id: message.id,
          channel_id: message.channel_id,
          content: message.content,
          timestamp: message.timestamp,
          edited_timestamp: message.edited_timestamp,
          author: message.author,
          type: message.type || 0,
          flags: message.flags || 0,
          state: "SENT",
          blocked: false,
          pinned: false,
          tts: false,
          mention_everyone: false,
          mentions: [],
          mention_roles: [],
          reactions: [],
          attachments: [],
          embeds: []
        };

        FinalDispatcher.dispatch({
          type: "MESSAGE_CREATE",
          channelId: channelId,
          message: prepared,
          optimistic: false,
          isFakeHiddenDM: true,
          guildId: message.guild_id,
          isPushNotification: false,
          suppressNotifications: true,
          suppressEmbeds: false,
          isRead: true,
          isAcknowledged: true,
          silent: true
        });

        FinalDispatcher.dispatch({
          type: "MESSAGE_ACK",
          channelId: channelId,
          messageId: message.id,
          readState: "READ"
        });
      } catch (e) {
        console.error("[HiddenDM] injectFakeMessage error:", e);
      }
    }

    function clearUnreadStates() {
      try {
        if (!ReadStateStore || !ReadStateStore.getAllReadStates || !BulkAck || !BulkAck.bulkAck) return;
        var unread = ReadStateStore.getAllReadStates().filter(function(s) {
          return ReadStateStore.hasUnread && ReadStateStore.hasUnread(s.channelId);
        });
        if (unread.length === 0) return;
        BulkAck.bulkAck(
          unread.map(function(s) {
            return { channelId: s.channelId, messageId: s._lastMessageId || s.lastMessageId };
          })
        );
      } catch(e) {}
    }

    function storeFakeMessage(channelId, messageObj) {
      var all = getFakeMessages();
      if (!all[channelId]) all[channelId] = [];
      all[channelId].push(messageObj);
      saveFakeMessages(all);
    }

    function buildFakeMessage(channelId, authorId, content) {
      var author = UserStore ? UserStore.getUser(authorId) : null;
      var id = generateSnowflake();

      var msg = {
        id: id,
        channel_id: channelId,
        content: content,
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

      return msg;
    }

    // preload stored fake messages
    try {
      var all = getFakeMessages();
      var channelIds = Object.keys(all);
      for (var ci = 0; ci < channelIds.length; ci++) {
        var chId = channelIds[ci];
        var msgs = all[chId];
        if (!Array.isArray(msgs)) continue;
        msgs.slice()
          .sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); })
          .forEach(function(msg) { injectFakeMessage(chId, msg, "preload"); });
      }
    } catch (e) {
      console.error("[HiddenDM] preloadFakeMessages error:", e);
    }

    // commands
    this._cmds = [];
    var cmds = [
      {
        id: "hiddendm_dm",
        name: "dm",
        displayName: "dm",
        description: "Inject the fake DM conversation",
        displayDescription: "Inject the fake DM conversation",
        options: [
          {
            name: "user",
            displayName: "user",
            description: "The other person in the DM",
            displayDescription: "The other person in the DM",
            type: 6,
            required: true,
          },
        ],
        execute: function(args, ctx) {
          try {
            var channelId = ctx.channel.id;
            log("dm execute called, channelId=" + channelId);
            log("args count=" + args.length + " args=" + JSON.stringify(args));

            // Get targ from the user option
            var targId = null;
            for (var a = 0; a < args.length; a++) {
              if (args[a].name === "user") targId = args[a].value;
            }
            log("targId=" + targId);

            // Get yourself
            var meModule = findByProps("getCurrentUser");
            var currentUser = meModule ? meModule.getCurrentUser() : null;
            var myId = currentUser ? currentUser.id : null;
            log("myId=" + myId);

            if (!targId || !myId) {
              log("FAIL: missing IDs targId=" + targId + " myId=" + myId);
              showToast("Could not get user IDs.", getAssetIDByName("Small"));
              return;
            }

            // Message 1: 3-5 hours earlier
            var now = Date.now();
            var hoursEarlier = (3 + Math.random() * 2) * 3600000;
            var firstTime = now - hoursEarlier;

            // Messages 2+: recent, spaced 30s-3min
            var timestamps = [firstTime];
            timestamps[1] = now - (SCRIPT.length - 1) * 90000 + Math.floor(Math.random() * 30000);
            for (var k = 2; k < SCRIPT.length; k++) {
              timestamps[k] = timestamps[k - 1] + 30000 + Math.floor(Math.random() * 150000);
            }

            for (var j = 0; j < SCRIPT.length; j++) {
              var authorId = j % 2 === 0 ? targId : myId;
              var msg = buildFakeMessage(channelId, authorId, SCRIPT[j]);
              msg.timestamp = new Date(timestamps[j]).toISOString();
              log("injecting msg " + j + " author=" + authorId + " content=" + SCRIPT[j].substring(0, 30));
              storeFakeMessage(channelId, msg);
              injectFakeMessage(channelId, msg, "command_dm");
            }
            clearUnreadStates();
            log("done, injected " + SCRIPT.length + " messages");
            showToast("Injected " + SCRIPT.length + " messages.", getAssetIDByName("Check"));
          } catch (e) {
            log("ERROR in /dm: " + e.message + " stack: " + e.stack);
            console.error("[HiddenDM] /dm error:", e);
            showToast("Failed: " + e.message, getAssetIDByName("Small"));
          }
        },
      },
      {
        id: "hiddendm_clear",
        name: "hiddendm_clear",
        displayName: "hiddendm_clear",
        description: "Clear all fake messages stored for this channel",
        displayDescription: "Clear all fake messages stored for this channel",
        options: [],
        execute: function(_args, ctx) {
          try {
            var all = getFakeMessages();
            var channelId = ctx.channel.id;
            var stored = all[channelId] || [];
            var count = stored.length;
            
            // Remove from visible chat - try multiple dispatch formats
            for (var d = 0; d < stored.length; d++) {
              try {
                FinalDispatcher.dispatch({
                  type: "MESSAGE_DELETE",
                  channelId: channelId,
                  id: stored[d].id,
                  messageId: stored[d].id,
                  guildId: null
                });
              } catch(e2) { log("delete dispatch err: " + e2.message); }
            }
            
            // Also try bulk delete
            try {
              var ids = stored.map(function(m) { return m.id; });
              FinalDispatcher.dispatch({
                type: "MESSAGE_DELETE_BULK",
                channelId: channelId,
                ids: ids,
                guildId: null
              });
            } catch(e3) { log("bulk delete err: " + e3.message); }
            
            delete all[channelId];
            saveFakeMessages(all);
            log("cleared " + count + " messages from storage, channelId=" + channelId);
            showToast("Cleared " + count + " fake message(s). Leave and reopen the DM if they still show.", getAssetIDByName("Trash"));
          } catch (e) {
            log("clear error: " + e.message);
          }
        },
      },
    ];

    var self = this;
    for (var i = 0; i < cmds.length; i++) {
      try {
        registerCommand(cmds[i]);
        self._cmds.push(cmds[i].id);
      } catch (e) {
        console.error("[HiddenDM] Failed to register command " + cmds[i].name + ":", e);
      }
    }

    // Re-inject fake messages when channel loads
    this._unsubs = [];
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
      stored
        .filter(function(m) { return !existingIds[m.id]; })
        .sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); })
        .forEach(function(m) { injectFakeMessage(channelId, m, "load_event"); });
    };

    var events = [
      "LOAD_MESSAGES_SUCCESS",
      "LOAD_MESSAGES_AROUND_SUCCESS",
      "LOAD_MESSAGES_SUCCESS_CACHED",
      "JUMP_TO_MESSAGE",
    ];

    for (var e = 0; e < events.length; e++) {
      if (FinalDispatcher && FinalDispatcher.subscribe) {
        FinalDispatcher.subscribe(events[e], handleLoad);
        this._unsubs.push((function(ev) {
          return function() { FinalDispatcher.unsubscribe(ev, handleLoad); };
        })(events[e]));
      }
    }
  },

  onUnload() {
    var unregisterCommand = vendetta.commands.unregisterCommand;
    if (this._cmds) {
      for (var i = 0; i < this._cmds.length; i++) {
        try { unregisterCommand(this._cmds[i]); } catch(e) {}
      }
    }
    if (this._unsubs) {
      for (var j = 0; j < this._unsubs.length; j++) { this._unsubs[j](); }
    }
  }
})
