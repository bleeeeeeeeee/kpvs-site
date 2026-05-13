const jwt = require("jsonwebtoken");
const { readUserJwtToken } = require("../services/auth-helpers");
function createRequireUserJwt(jwtCookieName, jwtSecret) {
  return function requireUserJwt(req, res, next) {
    const token = readUserJwtToken(req, jwtCookieName);
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      req.userJwt = jwt.verify(token, jwtSecret);
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}
module.exports = { createRequireUserJwt };
