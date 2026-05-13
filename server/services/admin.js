const { emailForAdminUserList } = require("./auth-helpers");
function mapUserListRow(u) {
  return {
    id: u.id != null ? Number(u.id) : u.id,
    username: u.username != null ? String(u.username) : "",
    email: emailForAdminUserList(u),
    role: u.role != null ? String(u.role) : "",
    is_active: Boolean(u.is_active),
    created_at: u.created_at,
    last_login: u.last_login
  };
}
module.exports = { mapUserListRow };
