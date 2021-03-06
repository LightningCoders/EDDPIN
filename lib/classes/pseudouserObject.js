var userObject = require('./user.js');
util = require('util');

/**
 * A fake user created by a module. This is used for bots managed by this application.
 * @class
 * @implements user
 * @constructor
 */
function pseudouserObject() {
    userObject.apply(this, arguments);

    if (arguments[0].parentModule !== undefined) {
        this.parentModule = arguments[0].parentModule;
    }

    this.isPseudo = true;
    this.isConnected = false;
    this.simulateActualUser = false;
}

util.inherits(pseudouserObject, userObject);

/**
 * Writes a raw string to the socket prefixed with the numeric of the pseudo user
 * @param string {string}
 */
pseudouserObject.prototype.writeToServer = function (string) {
    if (this.isConnected) {
        core.write(this.numeric + " " + string);
    }
}

/**
 * Gets the location in the myUser array of this pseudo user
 * @returns {number}
 */
pseudouserObject.prototype.getPlacement = function () {
    var users = this.parentModule.core.getPseudoUserNumerics();
    var x = 0;
    var targetPosition = null;
    while (x < users.length && targetPosition == null) {
        if (users[x] == this.numeric) {
            targetPosition = x;
        }
        x++;
    }

    // The first user is literally 1, no zero start.
    return x + 1;
};

/**
 * Joins the pseudo to a channel
 *
 * If the channel does not exist it will create it.
 *
 * @param channel {String|channel}
 * @param {Boolean} [force=false] Determines if a "simulated user" should be forced through adverse channel settings (e.g. via an SVSJoin)
 * @returns {pseudouserObject} Returns self
 */
pseudouserObject.prototype.join = function (channel, force) {
    var channelOrig = channel;
    var isNew = false;
    if (typeof channel == "string") {
        channel = core.getChannelByName(channel);
    }

    if (typeof force !== "boolean") {
        force = false;
    }

    if (channel != false) {
        if (!force && (this.simulateActualUser === true && !this.canJoin(channel))) {
            console.warn("Pseudo-user %s:%s (module %s) cannot join %s because of a ban setting.", this.nickname, this.numeric, this.parentModule.moduleName, channel.name);
        } else {
            this.writeToServer("J " + channel.name + " " + channel.creationTime);
        }
    } else {
        // Channel doesn't exist, we must create it!
        channel = new core.generic.channel(channelOrig, core.getTimestampUTC());
        channel.name = channelOrig;
        core.channels[channel.nameSafe] = channel;
        this.writeToServer("C " + channelOrig + " " + core.getTimestampUTC());

        // So we determine if the pseudo should be +o
        isNew = true;
    }
    channel.userJoin(this, (isNew ? "o" : ""));

    return this;
};

/**
 * Causes the Pseudo user to leave a channel
 * @param channel {channel|String}
 * @param message [{String}] The message to include with the part
 * @throws TypeError
 * @returns {pseudouserObject}
 */
pseudouserObject.prototype.part = function (channel, message) {

    if (typeof channel == "string") {
        channel = core.getChannelByName(channel);
    }
    if (typeof message == "undefined") {
        message = '';
    }

    if (!core.isType_channel(channel)) {
        throw new TypeError("Valid channel instance expected");
    }

    this.writeToServer('L ' + channel.name + " :" + message);
    channel.userPart(this);

    return this;
};

/**
 * Causes the pseudo user to quit network
 * @param message {String}
 * @param {Boolean} [purge=true] If set to true, this will remove the instance of the object from the myUsers stores as well. If set to false, it leaves the bot instance available so it can be re-attached if necessary
 * @returns {pseudouserObject}
 */

pseudouserObject.prototype.quit = function (message, purge) {
    this.writeToServer('Q :' + message);

    //Clean up after self
    core.destroyUser(this);
    if (purge === true) {
        this.parentModule.myUsers[this.numeric] = null;
        core.myUsers[this.numeric] = null;
    }
    return this;
};

/**
 * Has the pseudo user kick a target user out of a channel
 * @param channel {channel}
 * @param user {user}
 * @param reason {String}
 * @throws TypeError
 * @returns {pseudouserObject}
 */

pseudouserObject.prototype.kick = function (channel, user, reason) {

    if (!core.isType_channel(channel)) {
        throw new TypeError("Valid channel instance expected.");
    }
    if (!core.isType_user(user)) {
        throw new TypeError("Valid user instance expected.");
    }

    this.writeToServer(util.format("K %s %s :%s", channel.name, user.numeric, reason));

    return this;
};

/**
 * Has the pseudo user set a topic in a channel.
 * @param channel {channel}
 * @param topicStr {String}
 * @throws TypeError
 * @returns {pseudouserObject}
 */
pseudouserObject.prototype.setTopic = function (channel, topicStr) {
    if (!core.isType_channel(channel)) {
        throw new TypeError("Valid channel instance expected");
    }
    this.writeToServer(util.format('T %s :%s', channel.name, topicStr));
    channel.topic = topicStr;
    return this;
}

/**
 * Sends a CTCP request to a target
 * @param target {channel|user|String} If a string is provided, it will attempt to intelligently determine the proper target. Only nickname is support to resolve into a user object
 * @param message {string} The CTCP token to send
 * @returns {pseudouserObject}
 * @see privmsg
 */
pseudouserObject.prototype.ctcp = function (target, message) {
    this.privmsg(target, util.format('%s', message.toUpperCase()));

    return this;
};

/**
 * Sends a CTCP response to a target
 * @param target {user|String} A nickname as a string or user instance to send the reply to
 * @param type
 * @param message
 * @see ctcp
 */
pseudouserObject.prototype.ctcpReply = function (target, type, message) {
    this.notice(target, util.format('%s %s', type.toUpperCase(), message));
    return this;
}

pseudouserObject.prototype.emote = function (target, message) {
    this.privmsg(target, util.format('ACTION %s', message));
};
/**
 * Changes the nickname of the pseudo user
 * @param newNick {String}
 * @param {boolean} [forceCollision=false] If the target nickname exists when this is set to true, the user possessing that nickname will be disconnected from the network
 * @returns {boolean}
 */
pseudouserObject.prototype.changeNickname = function (newNick, forceCollision) {
    forceCollision = (typeof forceCollision === Boolean ? forceCollision : false);

    if (forceCollision == false) {
        // We don't want to collide nicknames, so check to make sure nick doesn't exist.
        if (core.getUserByNickname(newNick)) {
            return false;
        }
    }
    delete core.usersNickname[this.nickname.toLowerCase()];
    core.usersNickname[newNick.toLowerCase()] = this;
    this.nickname = newNick;

    this.writeToServer('N ' + newNick + " " + core.getTimestampUTC());

};
/**
 * Sends a PRIVMSG to a target
 * @param target {channel|user|String} If a string is provided, it will attempt to intelligently determine the proper target. Only nickname is support to resolve into a user object
 * @param message {string} The message to send
 * @throws TypeError
 * @returns {pseudouserObject}
 */
pseudouserObject.prototype.privmsg = function (target, message) {
    return this.variableTargetMessage(target, message, 'P');
};

/**
 * Sends a notice to a target
 * @param target {channel|user|String} If a string is provided, it will attempt to intelligently determine the proper target. Only nickname is support to resolve into a user object
 * @param target
 * @param message
 * @returns {pseudouserObject}
 */
pseudouserObject.prototype.notice = function (target, message) {
    return this.variableTargetMessage(target, message, 'O');
};

/**
 * Just an abstract function for notice and privmsg to use since they both follow the same syntax and rules
 * @param target
 * @param message
 * @param token The token to be sent, usually P or O for PRIVMSG and NOTICE, respectively
 * @returns {pseudouserObject}
 */
pseudouserObject.prototype.variableTargetMessage = function (target, message, token) {
    var finalTarget = '';
    var targetType = '';
    var valid = true;
    // allow devs to send us strings or object references
    if (typeof target == "string") {
        // Channel or nickname?
        if (core.isChannel(target) === true) {
            // no change needed here
            finalTarget = target;
            targetType = 'channelStr';
        } else {

            targetType = 'userNickname';
            var user = core.getUserByNickname(target);

            if (user === null) {
                throw new Error("No such nickname: " + target);
            } else {
                finalTarget = user.numeric;
            }
        }
    } else {
        if (core.isType_channel(target)) {
            targetType = "channelObject";
            finalTarget = target.name;
        } else if (core.isType_user(target)) {
            targetType = "userObject";
            finalTarget = target.numeric;
        } else {
            throw new TypeError("Valid channel or user instance expected.");
        }
    }

    // If the module wants this user to be treated like a real user, it must be in the channel to send the message.
    if (this.simulateActualUser === true && (targetType == "channelStr" || targetType == "channelObj")) {
        var channelTest = null;
        if (targetType == "channelStr") {
            channelTest = core.getChannelByName(target);
        } else if (targetType == "channelObj") {
            channelTest = target;
        }

        if (!core.isType_channel(channelTest)) {
            throw new TypeError("Valid channel instance expected.");
        }

        if (channelTest !== null && channelTest.hasUser(this) === false) {
            valid = false;
            console.warn("simulateActualUser: %s (%s) is not on %s; PRIVMSG not sent.", this.nickname, this.numeric, channelTest.name);
        }

    }
    if (valid) {
        this.writeToServer(token + ' ' + finalTarget + " :" + message);
    }
    return this;
};

/**
 * Announces the pseudo user to the network
 */
pseudouserObject.prototype.announce = function () {
    core.users[this.numeric] = this;
    core.usersNickname[this.nickname.toLowerCase()] = this;

    var modeString = this.usermodes + (this.account ? "r " + this.account : '');

    var sendString = util.format('N %s 1 %s ~%s %s +%s AAAAAA %s :%s', this.nickname, core.getTimestampUTC(), this.ident, this.host, modeString, this.numeric, this.GECOS);
    this.isConnected = true;
    core.serverWrite(sendString);
};


module.exports = pseudouserObject;