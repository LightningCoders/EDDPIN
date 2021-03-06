var server = function (serverName, numeric, description) {
    this.name = serverName.toLowerCase();
    this.numeric = numeric;
    this.description = description;
    this.uplinkServer = false;

    this.users = [];
};

server.prototype.addUser = function (user) {
    if (!core.isType_user(user)) {
        throw new TypeError("Valid user instance expected");
    }
    this.users[user.numeric] = user;

    return this;
};


server.prototype.getUserByNumeric = function (numeric) {
    return (this.users[numeric] !== undefined && this.users[numeric] !== null ? this.users[numeric] : null);
};

module.exports = server;