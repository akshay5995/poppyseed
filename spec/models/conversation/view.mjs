export const title = "A conversation";

export const state = (v) => {
  if (v.closed && v.conflict) return "Closed, cancel refused";
  if (v.closed) return "Closed";
  if (v.conflict) return "Request id conflict";
  if (v.handoff === "pending") return "Handoff waiting";
  if (v.req === "r1") return "Accepted";
  return "Not started";
};

export const step = (action) => {
  if (action === "Done") return null;
  if (action.startsWith("Post")) {
    return "post a message";
  }
  const labels = {
    AskHandoff: "ask for a person",
    CancelHandoff: "cancel the handoff",
    Close: "close (answered immediately)",
    CancelAfterClose: "cancel after close",
  };
  return labels[action] ?? action;
};

export const group = (v) => {
  if (v.closed) return "Closed";
  if (v.conflict) return "Conflict";
  if (v.handoff === "pending") return "Handoff";
  return "Open";
};

export const colors = {
  Open: "teal",
  Handoff: "orange",
  Conflict: "yellow",
  Closed: "purple",
};
