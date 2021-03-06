var parser = function () {
    this.tokenMap = {
        'AC': this.handleAccountAuth,
        'B': this.handleBurst,
        'C': this.handleChannelCreate,
        'D': this.handleKill,
        'EB': this.handleEndofBurst,
        'G': this.handleServerPing, // Uplink Pinging us
        'J': this.handleChannelJoin,
        'K': this.handleKick,
        'L': this.handleChannelPart, // user leaving a channel
        'M': this.handleMode, // channel, channel-user, user mode change.
        'N': this.handleN, // Newly connecting user or nick change
        'O': this.handleNotice,
        'OM': this.handleMode, // Op-overriding mode
        'P': this.handlePrivmsg,
        'PRIVS': this.handlePrivs, // When a user is assigned privileges after opering up
        'Q': this.handleUserQuit,
        'SE': this.handleSetTime, // Another server trying to sync our clocks
        'SN': this.handleSVSNick, // When a server forces a user nick change
        'SP': this.handleSVSPart, // When a server forces one of our users to part a channel
        'SJ': this.handleSVSJoin, // When a server forces one of our users to join a channel
        'SW': this.handleSWhoisSet,
        'SQ': this.handleServerQuit,
        'SERVER': this.handleNewServer_uplink, // Uplink connected
        'S': this.handleNewServer, // New server
        'T': this.handleTopic,
        'W': this.handleWhois
    };

    this.logger = require('./logger.js');
};

parser.prototype.parse = function (parseObj) {

    if (typeof this.tokenMap[parseObj.token] !== "function") {
        return false;
    }
    this.tokenMap[parseObj.token].call(this, parseObj);

    return true;
};

parser.prototype.handleAccountAuth = function (parseObj) {
    var spaceDelimited = parseObj.spaceDelimited;
    var eventObj = parseObj.eventObj;
    var actor = core.getUserByNumeric(spaceDelimited[2]);
    var account = spaceDelimited[4];
    actor.account = account;
    eventObj.actor = account;
    core.event.trigger("accountAuth", eventObj);
};

parser.prototype.handleBurst = function (parseObj) { // channel introduced by netburst
    var eventObj = parseObj.eventObj;
    var spaceDelimited = parseObj.spaceDelimited;
    var string = parseObj.string;
    var stringlessSplit = parseObj.stringlessSplit;

    var numeric = '';
    var chanName = spaceDelimited[2];
    var creationTime = spaceDelimited[3];
    var channel = (core.getChannelByName(chanName) === false ? new core.generic.channel(chanName, creationTime) : core.getChannelByName(chanName));
    var workingUser;
    var userSplit;
    var modes;
    var foundUser;

    channel.modes = (spaceDelimited.length > 5 ? spaceDelimited[4].substring(1) : '');

    // We need to parse for the param modes' values
    if (channel.modes !== '') {
        var separated = core.separateChannelModes(channel.modes);
        var paramModes = separated.paramModes.substr(1).split('');
        for (var paramIterator = 0; paramIterator < paramModes.length; paramIterator++) {
            //The original offset at is 4 for where mode declaration starts, so we increment from there to retrieve the values
            channel.modeParams[paramModes[paramIterator]] = spaceDelimited[4 + paramIterator + 1];
        }
    }

    core.channels[channel.nameSafe] = channel;

    //figure out the users
    // if the string contains no modes, everything is shifted over

    // The symbol :% signals the ban list
    // The ~ signals the start of the exception list.

    if (string !== null && string !== '' && typeof string !== 'undefined') {

        var stringParamArray = string.substr(1).split('~ ');

        var banArray = stringParamArray[0].split(' ');
        for (var banX = 0; banX < banArray.length; banX++) {
            if (channel.banExists(banArray[banX]) !== true) {
                channel.banAdd(banArray[banX]);
            }
        }

        if (typeof stringParamArray[1] !== 'undefined') {
            var exceptionArray = stringParamArray[1].split(' ');
            for (var exceptionX = 0; exceptionX < exceptionArray.length; exceptionX++) {
                if (channel.banExceptionExists(exceptionArray[exceptionX]) !== true) {
                    channel.banExceptionAdd(exceptionArray[exceptionX]);
                }
            }
        }
    }

    // We use stringlessSplit as it already has the ban stuff removed
    var delimitPosition = stringlessSplit.length - 1;
    var userRaw = stringlessSplit[delimitPosition].split(',');
    var userIndex;
    var workingModes = '';
    for (userIndex = 0; userIndex < userRaw.length; userIndex++) {
        workingUser = userRaw[userIndex];
        userSplit = workingUser.split(':');
        numeric = userSplit[0];
        modes = (userSplit[1] != null ? userSplit[1] : '');
        //The BURST dataline is grouped by modes that user has, here is it explained by Jobe of Evilnet Development
        /*
         <@Jobe>he list of users is sorted so that users without modes are first, then they're grouped by what modes they have, where only the  first user in each grouping is listed with the modes
         <@Jobe> eg
         <@Jobe> A,B,C,D:v,E,F,G:o,H,I:ov,J
         <@Jobe> A B and C dont have modes
         <@Jobe> D E and F have +v
         <@Jobe> G and H have +o
         <@Jobe> I and J have +o and +v
         */

        // So with that in mind, we'll apply the usermodes from instruction until we get a new set of modes
        if (modes !== workingModes && modes !== '') {
            workingModes = modes;
        }

        foundUser = core.getUserByNumeric(numeric);
        if (foundUser !== null) {
            channel.userJoin(foundUser, workingModes);
            eventObj.actor = foundUser;
            eventObj.channel = channel;
            core.event.trigger('channelJoin', eventObj);
        }
    }
    core.event.trigger('channelBurst', eventObj);
};

parser.prototype.handleChannelCreate = function (parseObj) { // user is creating a channel (first one to join it after emptied)
    var spaceDelimited = parseObj.spaceDelimited;
    var eventObj = parseObj.eventObj;
    var foundUser = core.getUserByNumeric(spaceDelimited[0]);
    var channelSplit = spaceDelimited[2].split(',');
    var channel;

    for (var x = 0; x < channelSplit.length; x++) {
        channel = new core.generic.channel(channelSplit[x]);
        core.channels[channel.nameSafe] = channel;

        channel.userJoin(foundUser, 'o'); // since they are the first one in the channel, they get +o automatically

        eventObj.actor = foundUser;
        eventObj.channel = channel;
        core.event.trigger('channelJoin', eventObj);
        core.event.trigger('channelCreated', eventObj);
    }
};

parser.prototype.handleChannelJoin = function (parseObj) {
    var spaceDelimited = parseObj.spaceDelimited;
    var eventObj = parseObj.eventObj;
    var channelSplit = spaceDelimited[2].split(',');
    var user = core.getUserByNumeric(spaceDelimited[0]);
    var channel;


    eventObj.actor = user;

    if (spaceDelimited[2] === '0') {
        // This means they are parting all of their channels.
        for (var x in user.channels) {
            user.channels[x]['channel'].userPart(user);
            eventObj.channel = user.channels[x];
            core.event.trigger('channelPart', eventObj);
        }
    } else {
        for (var x = 0; x < channelSplit.length; x++) {
            channel = core.getChannelByName(channelSplit[x]);
            channel.userJoin(user);

            eventObj.channel = channel;

            core.event.trigger('channelJoin', eventObj);
        }
    }
};

parser.prototype.handleChannelPart = function (parseObj) { // user parts channel
    var spaceDelimited = parseObj.spaceDelimited;
    var eventObj = parseObj.eventObj;
    var string = parseObj.string;
    var user = core.getUserByNumeric(spaceDelimited[0]);
    var channelSplit = spaceDelimited[2].split(',');
    var channel;

    for (var x = 0; x < channelSplit.length; x++) {
        channel = core.getChannelByName(channelSplit[x]);
        channel.userPart(user);

        eventObj.actor = user;
        eventObj.channel = channel;
        eventObj.data.reason = string;

        core.event.trigger('channelPart', eventObj);

        // if this channel is empty, we no longer have to keep track of it!
        // clear it from our memory
        if (channel.membershipCount() === 0 && !channel.isPersisted()) {
            core.event.trigger('channelDestroyed', eventObj);
            core.destroyChannel(channel);
        }
    }
};

parser.prototype.handleEndofBurst = function (parseObj) { // end of burst (supposedly sync'd to network)
    var server = parseObj.originatingServer;

    // Only load these delayed-start modules on the initial end of burst
    if (core.inBurst === true) {
        core.loadModule_group('uponUplinkBurst');
        this.logger.info("No longer in registration burst.");
    }

    if (server.uplinkServer === true) {
        core.serverWrite('EA');
    }

    parseObj.eventObj.originatingServer = server;
    core.inBurst = false;
    core.event.trigger('endOfBurst', parseObj.eventObj);
};

parser.prototype.handleKick = function (parseObj) {
    var spaceDelimited = parseObj.spaceDelimited;
    var eventObj = parseObj.eventObj;
    var string = parseObj.string;

    var channel = core.getChannelByName(spaceDelimited[2]);
    var actor = core.getUserByNumeric(spaceDelimited[0]);
    var victim = core.getUserByNumeric(spaceDelimited[3]);

    eventObj.actor = actor;
    eventObj.victim = victim;
    eventObj.channel = channel;
    eventObj.data.reason = string;

    channel.userPart(victim);

    // We must respond to the kick with a part
    if (core.isType_pseudouser(victim)) {
        victim.part(channel);
    }

    core.event.trigger('kick', eventObj);

    if (channel.membershipCount() === 0 && !channel.isPersisted()) {
        // @todo Broadcast event for destruction of channel.
        core.destroyChannel(channel);
    }

};

parser.prototype.handleKill = function (parseObj) {
    var victim = core.getUserByNumeric(parseObj.spaceDelimited[2]);
    var isServer = (parseObj.spaceDelimited[1].length == 2 );
    var actor = (isServer ? parseObj.originatingServer : core.getUserByNumeric(parseObj.spaceDelimited[0]));
    var eventObj = parseObj.eventObj;

    eventObj.actor = actor;
    eventObj.victim = victim;
    eventObj.data.reason = parseObj.string;
    eventObj.data.sourceIsUser = !isServer;

    // users vs pseudo users are handled differently. We should keep pseudo users in memory so they can be re-attached by the module
    if (core.isType_user_strict(victim)) {
        victim.quit();
    } else {
        victim.isConnected = false;
        victim.quit(null, false);
    }

    core.destroyUser(victim);
    core.event.trigger('userKilled', eventObj);
};

parser.prototype.handleMode = function (parseObj) {
    var token = parseObj.token;
    var spaceDelimited = parseObj.spaceDelimited;
    var isServer = (spaceDelimited[0].length == 2);
    var eventObj = parseObj.eventObj;
    var target = spaceDelimited[2];
    var oldModes;

    eventObj.data.actorIsUser = !isServer;

    if (core.isChannel(target) === true) {
        //handle mode changes to channel
        var channel = core.getChannelByName(target);
        var modeList = spaceDelimited[3];
        var separated = core.separateChannelModes(modeList);
        var paramModes = separated.paramModes;
        var resolveModes = core.resolveModes(channel.modes, separated.standardModes);
        var finalChannelModes = resolveModes.final;

        var plusorminus = '';
        var didchanModeChange = (resolveModes.added.length > 0 || resolveModes.removed.length > 0);

        var offset = 3;
        var position = 0;
        var x;
        var cursor;
        var newKey;
        var value;
        var user;
        var isUser;
        var eventName = '';
        var targetMap;

        eventObj.channel = channel;
        eventObj.actor = (isServer ? parseObj.originatingServer : core.getUserByNumeric(spaceDelimited[0]));
        eventObj.data.isOpMode = (token == 'OM');
        oldModes = channel.modes;

        // Sometimes the channel the channel might be empty, if +z is set, and a server or Op might be removing the +z
        // So we must check and destroy the channel since it lost its persist flag.
        if (channel.membershipCount() === 0 && resolveModes.removed.indexOf('z') != -1) {
            this.logger.info("Channel %s destroyed because it lost persist flag while empty.", channel.name);
            core.event.trigger('channelDestroyed', eventObj);
            core.destroyChannel(channel);

            // Channel's destroyed and it's empty anyway, so we don't need to continue
            return;
        }

        //now we handle the param modes (+/- o/h/v/k/l)
        for (x = 0; x < paramModes.length; x++) {

            // since we're in a loop dealing with multiple target types, this might exist from an earlier iteration.
            eventObj.victim = null;

            cursor = paramModes[x];
            if (cursor !== '+' && cursor !== '-') {
                position++;
                newKey = offset + position;

                value = spaceDelimited[newKey];
                user = core.getUserByNumeric(value);
                // could this be for a +k or +l ?
                isUser = (user !== null && user !== false);

                // If it's for a user, it means we are (un)applying op/voice
                // otherwise, it's for a channel mode that carries a parameter
                if (isUser === true) {
                    eventObj.victim = user;

                    if (typeof channel.users[value] === 'undefined')
                        this.logger.warn(value + " Not on Channel");
                    if (plusorminus === '+') {
                        channel.users[value].mode += cursor;
                        user.channels[channel.nameSafe].mode += cursor;

                        switch (cursor) {
                            case 'v':
                                eventName = 'userVoiced';
                                break;
                            case 'o':
                                eventName = 'userOpped';
                                break;
                            case 'h':
                                eventName = 'userHalfOpped';
                                break;
                        }
                    } else {
                        channel.users[value].mode = channel.users[value].mode.split(cursor).join('');
                        user.channels[channel.nameSafe].mode = user.channels[channel.nameSafe].mode.split(cursor).join('');

                        switch (cursor) {
                            case 'v':
                                eventName = 'userDeVoiced';
                                break;
                            case 'o':
                                eventName = 'userDeOpped';
                                break;
                            case 'h':
                                eventName = 'userDeHalfOpped';
                                break;
                        }
                    }

                    core.event.trigger(eventName, eventObj);
                    core.event.trigger("channelUserStatusChange", eventObj);

                } else {
                    if (plusorminus === '+') {
                        // bans are handled a little differently. We can store multiple and it doesn't get stored with other modes
                        if (cursor === 'b') {
                            channel.banAdd(value);
                        } else if (cursor === 'e') {
                            channel.banExceptionAdd(value);
                        } else {
                            didchanModeChange = true;

                            // it may be useful to have the param value
                            channel.modeParams[cursor] = value;

                            // add the param to the list
                            finalChannelModes += cursor;
                        }

                    } else {

                        if (cursor === 'b') {
                            channel.banRemove(value);

                        } else if (cursor === 'e') {
                            channel.banExceptionRemove(value);
                        } else {
                            didchanModeChange = true;

                            // remove from the list
                            finalChannelModes = finalChannelModes.split(cursor).join('');

                            // don't need to track it any more
                            delete channel.modeParams[cursor];
                        }
                    }

                    // Broadcast event about bans
                    var event_subname;
                    if (cursor == 'b') {
                        event_subname = (plusorminus == '+') ? 'channelBan' : 'channelUnban';
                        eventObj.data.mask = value;
                        core.event.trigger(event_subname, eventObj);
                    } else if (cursor == 'e') {
                        event_subname = (plusorminus == '+') ? 'channelBanExceptionAdd' : 'channelBanExceptionRemove';
                        eventObj.data.mask = value;
                        core.event.trigger(event_subname, eventObj);
                    }
                }
            } else {
                plusorminus = cursor;
            }
        }

        channel.modes = finalChannelModes;

        // Broadcast event if there has been a change to the channel's modes
        if (didchanModeChange === true) {
            //old modes seems to always have one of the operators on it, even if no channel-specific modes are applied
            eventObj.data.oldModes = oldModes;
            eventObj.data.finalModes = eventObj.channel.modes;

            core.event.trigger('channelModeChange', eventObj);
        }

    } else {
        //user is changing another (their own? probably?) user mode 
        var victim = core.getUserByNickname(target);
        var actor = core.getUserByNumeric(spaceDelimited[0]);
        var newModeList = spaceDelimited[3];
        oldModes = (victim.usermodes !== undefined && victim.usermodes !== null ? victim.usermodes : '');
        var modeFinal = core.resolveModes(oldModes, newModeList).final;

        victim.usermodes = modeFinal;

        eventObj.actor = actor;
        eventObj.victim = victim;
        eventObj.data.oldModes = oldModes;
        eventObj.data.modeDelta = newModeList;
        eventObj.data.modeFinal = modeFinal;
        core.event.trigger('userModeChange', eventObj);

        // events for special mode changes
        var finalSplit = modeFinal.split('');
        if (finalSplit.indexOf('o') !== -1) {
            core.event.trigger('operUp', eventObj);
        }
        if (finalSplit.indexOf('x') !== -1) {
            core.event.trigger('ipNowHidden', eventObj);
        }
        if (finalSplit.indexOf('a') !== -1) {
            core.event.trigger('ircAdminApplied', eventObj);
        }
    }
};

parser.prototype.handleN = function (parseObj) { /// new user or nickname change
    var eventObj = parseObj.eventObj;
    var server = parseObj.originatingServer;
    var spaceDelimited = parseObj.spaceDelimited;

    if (spaceDelimited.length === 4) { // this is a user changing their nickname!
        var actor = core.getUserByNumeric(spaceDelimited[0]);
        var newNickname = spaceDelimited[2];
        eventObj.actor = actor;
        eventObj.data.oldNickname = actor.nickname;

        // Remove old nickname from the map and replace it with the new one
        delete core.usersNickname[actor.nickname.toLowerCase()];
        core.usersNickname[newNickname.toLowerCase()] = actor;

        actor.nickname = newNickname;
        core.event.trigger('userNicknameChange', eventObj);
    } else {
        var postModeOffset = 7;
        var usermodes = '';

        // We need to check modes for param modes. Start is offset 7. But modes are optional, so we need to do some offset magic here if necessary.
        var paramList = [];
        if (spaceDelimited[7].substr(0, 1) == "+") {
            var originalModes = spaceDelimited[7];
            var separateModes = core.separateUserModes(originalModes);
            var paramSplit = separateModes.paramModes.substr(1).split('');
            usermodes = originalModes.substr(1); // trim the +
            //we must handle param modes now

            for (var x = 0; x < paramSplit.length; x++) {
                postModeOffset++;
                paramList[paramSplit[x]] = spaceDelimited[postModeOffset];
            }

        } else {
            //Modes weren't specified, so we subtract one
            postModeOffset--;
        }

        var userNumeric = spaceDelimited[postModeOffset + 2];
        var optionsObject = {
            numeric: userNumeric,
            account: (typeof paramList['r'] !== "undefined" ? paramList['r'].split(":")[0] : null), // It might look like this Account:3420394290
            nickname: spaceDelimited[2],
            GECOS: parseObj.string,
            ident: spaceDelimited[5],
            host: spaceDelimited[6],
            usermodes: usermodes,
            usermodes_params: paramList
        };

        var newUser = new core.generic.user(optionsObject);

        core.users[userNumeric] = newUser;
        core.usersNickname[optionsObject.nickname.toLowerCase()] = newUser;
        server.addUser(newUser);

        eventObj.actor = newUser;
        eventObj.data.inBurst = core.inBurst;
        core.event.trigger('newUser', eventObj);
    }

};

parser.prototype.handleNewServer_uplink = function (parseObj) {
    var eventObj = parseObj.eventObj;
    var description = parseObj.string;
    var name = parseObj.spaceDelimited[1];
    var numeric = parseObj.spaceDelimited[6].substring(0, 2);
    var server = new core.generic.server(name, numeric, description);

    server.uplinkServer = true;
    core.servers[numeric] = server;

    eventObj.data.server = server;
    core.event.trigger('uplinkConnected', eventObj);
};

parser.prototype.handleNewServer = function (parseObj) {

    var eventObj = parseObj.eventObj;
    var description = parseObj.string;
    var name = parseObj.spaceDelimited[2];
    var numeric = parseObj.spaceDelimited[7].substring(0, 2);
    var server = new core.generic.server(name, numeric, description);

    core.servers[numeric] = server;
    eventObj.data.server = server;

    core.event.trigger('serverConnected', eventObj);
};

parser.prototype.handlePrivmsg = function (parseObj) {
    var eventObj = parseObj.eventObj;
    var target = parseObj.spaceDelimited[2];
    var incNumeric = parseObj.spaceDelimited[0];
    var isServer = (incNumeric.length == 2);
    var eventSuffix = "_" + (isServer ? "server" : "user"); // we want to distinct events for messages from servers and from users
    var eventPrefix = 'message';
    eventObj.actor = (isServer ? parseObj.originatingServer : core.getUserByNumeric(incNumeric));
    eventObj.data.text = parseObj.string;
    eventObj.data.actorIsUser = !isServer;


    // If it's wrapped in this symbol, it's actually a CTCP or an emote
    if (parseObj.string.substr(0, 1) == '' && parseObj.string.substr(parseObj.string.length - 1, 1) == '') {
        if (parseObj.string.substr(1, 6) == 'ACTION') {
            eventPrefix = 'emote';

            eventObj.data.text = parseObj.string.substr(8, parseObj.string.length - 9);
        }
        else {
            eventPrefix = 'ctcp';

            //remove the signal character and make upper case for consistency sake
            eventObj.data.text = parseObj.string.substr(1, parseObj.string.length - 2).toUpperCase();
        }
    }

    if (core.isChannel(target) === true) { // message sent to a channel (server will only see this if a pseudo user is on target channel)
        eventObj.channel = core.getChannelByName(parseObj.spaceDelimited[2]);

        core.event.trigger(eventPrefix + 'Channel' + eventSuffix, eventObj);
    } else { // message sent a user (server will only see this if the pseudo user is the target)
        eventObj.victim = core.getUserByNumeric(parseObj.spaceDelimited[2]);

        core.event.trigger(eventPrefix + 'User' + eventSuffix, eventObj)
    }

    //it's a little redundant but let's also trigger an event for any kind of message
    core.event.trigger(eventPrefix + eventSuffix, eventObj);
};

parser.prototype.handleNotice = function (parseObj) {
    var eventObj = parseObj.eventObj;
    var target = parseObj.spaceDelimited[2];
    var isCTCP = false;
    var incNumeric = parseObj.spaceDelimited[0];
    var isServer = (incNumeric.length == 2);
    var eventSuffix = "_" + (isServer ? "server" : "user"); // we want to distinct events for messages from servers and from users
    eventObj.actor = (isServer ? parseObj.originatingServer : core.getUserByNumeric(incNumeric));
    eventObj.data.text = parseObj.string;
    eventObj.data.actorIsUser = !isServer;

    // If it's wrapped in this symbol, it's actually a CTCP response
    if (parseObj.string.substr(0, 1) == '' && parseObj.string.substr(parseObj.string.length - 1, 1) == '') {
        isCTCP = true;
        //remove the symbol stuff.
        var string = parseObj.string.split('').join('');
        var spaceSplit = string.split(" ");

        //remove the signal character and make upper case for consistency sake
        eventObj.data.ctcpResponseType = spaceSplit.shift();
        eventObj.data.ctcpResponseValue = spaceSplit.join(" ");
    }

    if (core.isChannel(target) === true) { // message sent to a channel (server will only see this if a pseudo user is on target channel)
        eventObj.channel = core.getChannelByName(parseObj.spaceDelimited[2]);

        core.event.trigger('noticeChannel' + eventSuffix, eventObj);
    } else { // message sent a user (server will only see this if the pseudo user is the target)
        eventObj.victim = core.getUserByNumeric(parseObj.spaceDelimited[2]);

        core.event.trigger('noticeUser' + eventSuffix, eventObj)
    }

    //it's a little redundant but let's also trigger an event for any kind of message
    core.event.trigger((isCTCP ? 'ctcpReply' : 'notice' + eventSuffix), eventObj);
};

parser.prototype.handlePrivs = function (parseObj) {
    var eventObj = parseObj.eventObj;
    var spaceDelimited = parseObj.spaceDelimited;
    var targetUser = core.getUserByNumeric(spaceDelimited[2]);

    eventObj.victim = targetUser;

    //The list of privs start at offset 3.
    for (var x = 3; x < spaceDelimited.length; x++) {
        targetUser.addPriv(spaceDelimited[x]);
        eventObj.data.privName = spaceDelimited[x];

        core.event.trigger('operPrivilegeAssigned', eventObj);
    }
};

parser.prototype.handleUserQuit = function (parseObj) {
    var eventObj = parseObj.eventObj;
    var spaceDelimited = parseObj.spaceDelimited;
    var string = parseObj.string;
    var quitter = core.getUserByNumeric(spaceDelimited[0]);

    eventObj.actor = quitter;
    eventObj.data.reason = string;
    eventObj.data.sQuit = false;
    core.event.trigger('quit', eventObj);
    core.destroyUser(quitter);
};

parser.prototype.handleServerPing = function () {
    core.pong();
    core.event.trigger('ping');
};

parser.prototype.handleServerQuit = function (parseObj) {
    var eventObj = parseObj.eventObj;
    var spaceDelimited = parseObj.spaceDelimited;
    var string = parseObj.string;
    var quitServer = core.getServerByName(spaceDelimited[2]);
    var numeric = quitServer.numeric;

    eventObj.actor = quitServer;
    eventObj.data.reason = string;
    core.event.trigger('serverQuit', eventObj);

    // we must destroy the users on this server.
    for (var userIndex in quitServer.users) {
        eventObj.actor = quitServer.users[userIndex];
        eventObj.data.reason = "*.net *.split";
        eventObj.data.sQuit = true;
        core.event.trigger('quit', eventObj);
        core.destroyUser(quitServer.users[userIndex]);
    }

    delete core.servers[numeric];
};

parser.prototype.handleSetTime = function (parseObj) {
    if (typeof parseObj.spaceDelimited[3] === "undefined" || parseObj.spaceDelimited[3] == core.serverNumeric) {
        var oldTimestamp = core.getTimestampUTC();
        var newTimestamp = parseObj.spaceDelimited[2];
        core.timeOffset = (newTimestamp - oldTimestamp);
        core.logger.info(parseObj.originatingServer.name + " setting new TS offset at " + core.timeOffset);
    }
}

parser.prototype.handleSVSNick = function (parseObj) {
    var eventObj = parseObj.eventObj;
    var spaceDelimited = parseObj.spaceDelimited;
    var victim = core.getUserByNumeric(spaceDelimited[2]);
    eventObj.victim = victim;
    eventObj.originatingServer = parseObj.originatingServer;
    eventObj.data.newNick = spaceDelimited[3];

    // The spec apparently requires us to obey this no matter what?
    if (victim.isPseudo === true) {
        victim.changeNickname(spaceDelimited[3]);
        eventObj.data.obeyed = true;
    }

    core.event.trigger("SVSNick", eventObj);
};

parser.prototype.handleSVSPart = function (parseObj) {
    var isServer = (parseObj.spaceDelimited[1].length == 2);
    var actor = (isServer ? parseObj.originatingServer : core.getUserByNumeric(parseObj.spaceDelimited[0]));
    var victim = core.getUserByNumeric(parseObj.spaceDelimited[2]);
    var event = parseObj.eventObj;

    event.victim = victim;
    event.actor = actor;
    event.data.actorIsUser = !isServer;
    event.data.obeyed = false;

    // We only obey this if the pseudo user is simulating a real user.
    // Also, we will probably only see this message if it's targeting one of our pseudo users, but it's best check.
    if (victim.isPseudo === true && victim.simulateActualUser === true) {
        victim.part(parseObj.spaceDelimited[3], parseObj.string);
        event.data.obeyed = true;
    }

    event.channel = core.getChannelByName(parseObj.spaceDelimited[3]);
    core.event.trigger("SVSPart", event);
};
parser.prototype.handleSVSJoin = function (parseObj) {
    var isServer = (parseObj.spaceDelimited[1].length == 2);
    var actor = (isServer ? parseObj.originatingServer : core.getUserByNumeric(parseObj.spaceDelimited[0]));
    var victim = core.getUserByNumeric(parseObj.spaceDelimited[2]);
    var event = parseObj.eventObj;

    event.victim = victim;
    event.actor = actor;
    event.data.actorIsUser = !isServer;
    event.data.obeyed = false;

    // We only obey this if the pseudo user is simulating a real user.
    // Also, we will probably only see this message if it's targeting one of our pseudo users, but it's best check.
    if (victim.isPseudo === true && victim.simulateActualUser === true) {
        victim.join(parseObj.spaceDelimited[3], true);
        event.data.obeyed = true;
    }

    event.channel = core.getChannelByName(parseObj.spaceDelimited[3]);
    core.event.trigger("SVSJoin", event);
};

parser.prototype.handleSWhoisSet = function (parseObj) {
    var spaceDelimited = parseObj.spaceDelimited;
    var string = parseObj.string;
    var eventObj = parseObj.eventObj;
    var actor = core.getUserByNumeric(spaceDelimited[2]);
    actor.swhois = string;
    eventObj.actor = actor;

    core.event.trigger('swhoisSet', eventObj);
};

parser.prototype.handleTopic = function (parseObj) { // topic is changed
    var eventObj = parseObj.eventObj;
    var spaceDelimited = parseObj.spaceDelimited;
    var string = parseObj.string;
    var channel = eventObj.channel = core.getChannelByName(spaceDelimited[2]);
    var setter = spaceDelimited[0];

    // Can be set by user or server
    if (setter.length == 2) {
        eventObj.actor = core.getServerByNumeric(setter);
        eventObj.data.serverSet = true;
    } else {
        eventObj.actor = core.getUserByNumeric(setter);
        eventObj.data.serverSet = false;
    }

    eventObj.data.newTopic = string;
    eventObj.data.oldTopic = channel.topic;
    channel.topic = string;

    core.event.trigger("topicSet", eventObj);

};

/**
 * @todo This needs to be done properly.
 * @param parseObj
 */
parser.prototype.handleWhois = function (parseObj) {
    var spaceDelimited = parseObj.spaceDelimited;
    var string = parseObj.string;
    var actor = core.getUserByNumeric(spaceDelimited[0]);
    var victim = core.getUserByNickname(string);

    core.serverWrite(util.format("%d %s %s %s %s * :%s", 311, actor.numeric, string, victim.ident, victim.host, victim.GECOS));
    core.serverWrite(util.format("%d %s %s :%s", 319, actor.numeric, string, victim.chanListArray().join(" ")));

    if (actor.isOper()) {
        core.serverWrite(util.format("%d %s %s :is an EDDPIN pseudo-user, originating from module %s", 313, actor.numeric, string, victim.parentModule.biography.title));
    }
    core.serverWrite(util.format("%d %s %s :%s", 318, actor.numeric, string, "End of /WHOIS List"));
};

module.exports = parser;