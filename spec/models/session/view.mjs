export const title = "A session";

export const state = (v) => {
  if (v.phase === "none") return "No session yet";
  if (v.phase === "ended") return "Session ended";
  if (v.phase === "signedIn") return v.dpop === "new" ? "Signed in, new key" : "Signed in";
  if (v.refresh === "revoked") return "Signed out after sign-out";
  return "Signed out";
};

export const step = (action) => {
  const labels = {
    Start: "first request with a new sid",
    SignIn: "sign in (direct, device, or mediated)",
    RefreshNewKey: "refresh with a new DPoP key",
    RefreshOtherSid: "use the same refresh token from another session",
    SignOut: "revoke the refresh token",
    UseSignedOut: "call again with only the session",
    CompanyEnds: "the company ends the session",
    Done: null,
  };
  return labels[action] ?? action;
};

export const group = (v) => {
  if (v.phase === "ended") return "Ended";
  if (v.phase === "signedIn") return "Signed in";
  if (v.refresh === "revoked") return "Signed out";
  return "Starting";
};

export const colors = {
  Starting: "tan",
  "Signed in": "teal",
  "Signed out": "orange",
  Ended: "purple",
};
