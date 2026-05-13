const helpers = require("./auth-helpers");
const mail = require("./auth-mail");
module.exports = Object.assign({}, helpers, mail);
