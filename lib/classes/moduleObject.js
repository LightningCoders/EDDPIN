/**
 * @constructor
 * @alias module
 */
var moduleObj = function () {
    this.myUsers = [];
};
moduleObj.prototype.events = {};


moduleObj.prototype.biography = {
    title: 'Untitled Module',
    description: 'An enigmatic module',
    author: 'Anonymous',
    version: '1.0'
};

/**
 * Determines if the event in question deals with any of the module's pseudo users.
 * @param eventObj {eventObj}
 * @return boolean Returns true if eventObj.victim is one of the module's users or if eventObj.channel contains one of the module's users
 */
moduleObj.prototype.eventAffectsMe = function (eventObj) {
    var channelPresence = (core.isType_channel(eventObj.channel) && this.hasPresenceOnChannel(eventObj.channel));
    var victimhood = (core.isType_pseudouser(eventObj.victim) && this.isMyUser(eventObj.victim));
    return (victimhood || channelPresence);
};

/**
 * Returns an array of user objects from the current module that are in specified channel
 * @param channel {channel}
 * @returns {Array}
 */
moduleObj.prototype.getPresenceOnChannel = function (channel) {
    var returnArray = [];

    if (!core.isType_channel(channel)) {
        throw new TypeError("Valid channel instance expected");
    }
    for (var user in channel.users) {
        if (this.isMyUser(channel.users[user].user) == true) {
            returnArray[returnArray.length] = channel.users[user].user;
        }
    }

    return returnArray;
}
/**
 * Determines if the module has any pseudousers joined to a channel
 * @param channel {channel}
 * @returns {boolean}
 */
moduleObj.prototype.hasPresenceOnChannel = function (channel) {
    if (!core.isType_channel(channel)) {
        throw new TypeError("Valid channel instance expected");
    }
    for (var user in channel.users) {
        if (this.isMyUser(channel.users[user].user) == true) {
            return true;
        }
    }

    return false;
}
/**
 * Adds a listen to a specific event
 * @param eventName {String}
 * @param callback {function}
 * @param options {object}
 * @returns {boolean}
 * @see subscribeToEvent_selfish
 */
moduleObj.prototype.subscribeToEvent = function (eventName, callback, options) {
    return core.event.listen(eventName, this, callback, options);
};

/**
 * Subscribes to an event, where callback is only occured if a module's is affected by that particular event
 * @param eventName
 * @param callback
 * @param options
 */
moduleObj.prototype.subscribeToEvent_selfish = function (eventName, callback, options) {
    if (typeof options != "object") {
        options = {};
    }

    options.selfish = true;

    return this.subscribeToEvent(eventName, callback, options);
};


/**
 * Creates a pseudo user attached to the module
 * @param optionsObj
 * @returns {pseudouserObject}
 * @see createPseudoUser
 */
moduleObj.prototype.createBot = function (optionsObj) {
    return core.createPseudoUser(this, optionsObj);
};

/**
 * Determines if a user is a pseudo user spawned by the module
 * @param user {user}
 * @returns {boolean}
 */
moduleObj.prototype.isMyUser = function (user) {
    if (!core.isType_user(user)) {
        throw new TypeError("Valid user instance expected.");
    }
    if (user !== null) {
        for (var key in this.myUsers) {
            if (key === user.numeric) {
                return true;
            }
        }
    }

    return false;
};

module.exports = moduleObj;