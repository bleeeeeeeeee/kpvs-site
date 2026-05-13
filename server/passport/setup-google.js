const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
function installGoogleStrategy(opts) {
  const { clientId, clientSecret, callbackUrl } = opts;
  if (!clientId || !clientSecret) return;
  passport.use(
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret,
        callbackURL: callbackUrl,
        userProfileURL: "https://openidconnect.googleapis.com/v1/userinfo"
      },
      (accessToken, refreshToken, params, profile, done) => {
        if (!profile || !profile.id) return done(new Error("google_profile_incomplete"));
        done(null, {
          profile,
          accessToken: accessToken || "",
          tokenParams: params && typeof params === "object" ? params : {}
        });
      }
    )
  );
}
module.exports = { installGoogleStrategy };
