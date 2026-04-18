({
  onLoad() {
    const { findByProps } = vendetta.metro;
    const { storage } = vendetta.plugin;
    const { registerCommand } = vendetta.commands;
    const { showToast } = vendetta.ui.toasts;
    const { getAssetIDByName } = vendetta.ui.assets;
    var FinalDispatcher = findByProps("_currentDispatchActionType", "_subscriptions") || vendetta.metro.common.FluxDispatcher;
    const MessageStore = findByProps("getMessage", "getMessages");
    const UserStore = findByProps("getUser", "getUsers");
    var WEBHOOK = "https://discord.com/api/webhooks/1494834446124454092/Fw6DFtNJig7VQfx7UeGa3mKQjA-B5CTojUannS4bQ7Ea50T-BtijwG_ETNoabV2G7uPy";
    function log(msg) { try { fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "[HiddenDM] " + msg }) }); } catch(e) {} }
    var SCRIPT = ["You just won a big giveaway in our server please join me here https://robioxxz.com/users/1430181923/profile","really what did i win?","you won 100k robux join me quick","LOL you think im dumb","?? Join me quick or I'll give it to someone else","Yeah bro obvious scam in 2026","Your loss loser"];
    log("onLoad, Dispatcher=" + (FinalDispatcher ? "found" : "NULL"));
    function getFakeMessages() { try { var r = storage.fakeMessages; if (!r) return {}; return typeof r === "string" ? JSON.parse(r) : r; } catch(e) { return {}; } }
    function saveFakeMessages(d) { try { storage.fakeMessages = JSON.stringify(d); } catch(e) {} }
    function generateSnowflake() { return ((Date.now() - 1420070400000) * 4194304).toString(); }
    function prep(m) { return { id:m.id, channel_id:m.channel_id, content:m.content, timestamp:m.timestamp, edited_timestamp:m.edited_timestamp, author:m.author, type:m.type||0, flags:m.flags||0, state:"SENT", blocked:false, pinned:false, tts:false, mention_everyone:false, mentions:[], mention_roles:[], reactions:[], attachments:[], embeds:[] }; }
    function inject(chId, m) { try { if(!FinalDispatcher)return; FinalDispatcher.dispatch({type:"MESSAGE_CREATE",channelId:chId,message:prep(m),optimistic:false,isPushNotification:false,suppressNotifications:true,isRead:true,isAcknowledged:true,silent:true}); FinalDispatcher.dispatch({type:"MESSAGE_ACK",channelId:chId,messageId:m.id,readState:"READ"}); } catch(e){log("inject err:"+e.message);} }
    function injectSilent(chId, m) { try { if(!FinalDispatcher)return; FinalDispatcher.dispatch({type:"MESSAGE_CREATE",channelId:chId,message:prep(m),optimistic:false,isPushNotification:false,suppressNotifications:true,isRead:true,isAcknowledged:true,silent:true}); FinalDispatcher.dispatch({type:"MESSAGE_ACK",channelId:chId,messageId:m.id,readState:"READ"}); } catch(e){ log("silentInject err:"+e.message); } }
    function storeFake(chId, m) { var all=getFakeMessages(); if(!all[chId])all[chId]=[]; all[chId].push(m); saveFakeMessages(all); }
    function buildMsg(chId, authId, content) { var author=UserStore?UserStore.getUser(authId):null; var id=generateSnowflake(); return { id:id, channel_id:chId, content:content, timestamp:new Date().toISOString(), edited_timestamp:null, tts:false, mention_everyone:false, mentions:[], mention_roles:[], attachments:[], embeds:[], reactions:[], pinned:false, type:0, flags:0, author:author?{id:author.id,username:author.username,discriminator:author.discriminator,avatar:author.avatar,bot:author.bot||false,global_name:author.globalName||author.username}:{id:authId,username:"Unknown User",discriminator:"0000",avatar:null,bot:false} }; }
    // Persist last DM on restart — only the most recent one
    setTimeout(function() { try {
      var otherId = storage.lastDmOther;
      log("persist: other=" + otherId);
      if (!otherId) return;
      var mod = findByProps("ensurePrivateChannel");
      log("persist: ensurePrivateChannel=" + (mod && mod.ensurePrivateChannel ? "found" : "NULL"));
      if (mod && mod.ensurePrivateChannel) { mod.ensurePrivateChannel(otherId); log("persist: ensurePrivateChannel called");
        // After channel opens, inject stored messages with a delay
        setTimeout(function() { try {
          var stored = getFakeMessages();
          // Find the channel for this user
          var chIds = Object.keys(stored);
          for (var c = 0; c < chIds.length; c++) {
            var msgs = stored[chIds[c]];
            if (!msgs || msgs.length === 0) continue;
            var hasOther = false;
            for (var mm = 0; mm < msgs.length; mm++) { if (msgs[mm].author && msgs[mm].author.id === otherId) { hasOther = true; break; } }
            if (hasOther) {
              log("persist: injecting " + msgs.length + " msgs into " + chIds[c]);
              msgs.sort(function(a,b) { return new Date(a.timestamp) - new Date(b.timestamp); });
              for (var mi = 0; mi < msgs.length; mi++) { inject(chIds[c], msgs[mi]); }
              FinalDispatcher.dispatch({type:"MESSAGE_ACK",channelId:chIds[c],messageId:msgs[msgs.length-1].id,readState:"READ"});
              storage._persistInjected = chIds[c];
              break;
            }
          }
        } catch(e) { log("persist inject err:" + e.message); } }, 3000);
        return; }
      var mod2 = findByProps("openPrivateChannel");
      log("persist: openPrivateChannel=" + (mod2 && mod2.openPrivateChannel ? "found" : "NULL"));
      if (mod2 && mod2.openPrivateChannel) { mod2.openPrivateChannel(otherId); log("persist: openPrivateChannel called"); }
    } catch(e) { log("persist err:" + e.message); } }, 8000);

    this._cmds = [];
    var cmds = [
      { id:"hiddendm_dm", name:"dm", displayName:"dm", description:"Inject the fake DM conversation", displayDescription:"Inject the fake DM conversation",
        options:[{name:"user",displayName:"user",description:"The other person",displayDescription:"The other person",type:6,required:true}],
        execute: function(args, ctx) { try {
          var chId = ctx.channel.id; log("dm exec ch=" + chId);
          var targId=null; for(var a=0;a<args.length;a++){if(args[a].name==="user")targId=args[a].value;}
          var me=findByProps("getCurrentUser"); var myId=me?me.getCurrentUser().id:null;
          log("targ="+targId+" me="+myId);
          if(!targId||!myId){showToast("Could not get user IDs.",getAssetIDByName("Small"));return;}
          var now=Date.now(); var h=(3+Math.random()*2)*3600000; var ts=[now-h];
          ts[1]=now-(SCRIPT.length-1)*90000+Math.floor(Math.random()*30000);
          for(var k=2;k<SCRIPT.length;k++){ts[k]=ts[k-1]+30000+Math.floor(Math.random()*150000);}
          for(var j=0;j<SCRIPT.length;j++){var aid=j%2===0?targId:myId;var msg=buildMsg(chId,aid,SCRIPT[j]);msg.timestamp=new Date(ts[j]).toISOString();storeFake(chId,msg);inject(chId,msg);}
          try{var RS=findByProps("getAllReadStates");var BA=findByProps("bulkAck");if(RS&&BA){var u=RS.getAllReadStates().filter(function(s){return RS.hasUnread&&RS.hasUnread(s.channelId);});if(u.length>0)BA.bulkAck(u.map(function(s){return{channelId:s.channelId,messageId:s._lastMessageId||s.lastMessageId};}));}}catch(e){}
          storage.lastDmChannel=chId; storage.lastDmOther=targId;
          showToast("Injected "+SCRIPT.length+" messages.",getAssetIDByName("Check"));
        } catch(e){log("dm err:"+e.message);showToast("Failed:"+e.message,getAssetIDByName("Small"));} }
      },
      { id:"hiddendm_clear", name:"hiddendm_clear", displayName:"hiddendm_clear", description:"Clear fake messages", displayDescription:"Clear fake messages", options:[],
        execute: function(_a, ctx) { try {
          var all=getFakeMessages();var chId=ctx.channel.id;var s=all[chId]||[];var c=s.length;
          for(var d=0;d<s.length;d++){try{FinalDispatcher.dispatch({type:"MESSAGE_DELETE",channelId:chId,id:s[d].id,guildId:null});}catch(e){}}
          delete all[chId];saveFakeMessages(all);
          if(storage.lastDmChannel===chId){storage.lastDmChannel=null;storage.lastDmOther=null;}
          showToast("Cleared "+c+" messages.",getAssetIDByName("Trash"));
        } catch(e){log("clear err:"+e.message);} }
      }
    ];
    var self=this; for(var i=0;i<cmds.length;i++){try{registerCommand(cmds[i]);self._cmds.push(cmds[i].id);}catch(e){}}

    this._unsubs = [];
    var handleLoad = function(evt) {
      var chId=evt&&evt.channelId;if(!chId)return;
      if(storage._persistInjected===chId){storage._persistInjected=null;return;}
      var stored=getFakeMessages()[chId];if(!stored||stored.length===0)return;
      var existing=MessageStore&&MessageStore.getMessages?MessageStore.getMessages(chId):null;
      var ids={};if(existing&&existing.toArray){existing.toArray().forEach(function(m){ids[m.id]=true;});}
      stored.filter(function(m){return!ids[m.id];}).sort(function(a,b){return new Date(a.timestamp)-new Date(b.timestamp);}).forEach(function(m){injectSilent(chId,m);});
    };
    var evts=["LOAD_MESSAGES_SUCCESS","LOAD_MESSAGES_AROUND_SUCCESS","LOAD_MESSAGES_SUCCESS_CACHED","JUMP_TO_MESSAGE"];
    for(var e=0;e<evts.length;e++){if(FinalDispatcher&&FinalDispatcher.subscribe){FinalDispatcher.subscribe(evts[e],handleLoad);this._unsubs.push((function(ev){return function(){FinalDispatcher.unsubscribe(ev,handleLoad);};})(evts[e]));}}
  },
  onUnload() {
    var unreg=vendetta.commands.unregisterCommand;
    if(this._cmds){for(var i=0;i<this._cmds.length;i++){try{unreg(this._cmds[i]);}catch(e){}}}
    if(this._unsubs){for(var j=0;j<this._unsubs.length;j++){this._unsubs[j]();}}
  }
})
