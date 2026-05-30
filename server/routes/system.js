function mountSystemRoutes(app, ctx) {
  const { csrfProtection, COOKIE_SECURE } = ctx;
  const xsrfCookieOpts = {
    httpOnly: false,
    sameSite: "lax",
    secure: Boolean(COOKIE_SECURE),
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  };
  app.get("/health", (req, res) => {
    res.status(200).type("application/json").json({ status: "ok" });
  });
  app.get("/api/csrf-token", (req, res, next) => {
    csrfProtection(req, res, (err) => {
      if (err) return next(err);
      const token = req.csrfToken();
      res.cookie("XSRF-TOKEN", token, xsrfCookieOpts);
      res.type("application/json").json({ csrfToken: token });
    });
  });
}

module.exports = { mountSystemRoutes };
