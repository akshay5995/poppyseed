export const title = "An operation";

export const state = (v) => {
  if (v.st === "idle") return "No operation";
  if (v.st === "required" && v.revision > 1) return "Needs approval, new revision";
  if (v.st === "required") return "Needs approval";
  if (v.st === "declined") return "Declined";
  if (v.approver === "agent") return "Performed, agent approved";
  return "Performed, user approved";
};

export const step = (action) => {
  if (action === "Done" || action === "ApproveAgain") return null;
  if (action.startsWith("Approve")) return "approve and run it once";
  const labels = {
    Propose: "the tool asks for approval",
    Revise: "terms change, so a new revision",
    Decline: "the user declines",
  };
  return labels[action] ?? action;
};

export const group = (v) => {
  if (v.st === "done") return "Performed";
  if (v.st === "declined") return "Declined";
  if (v.st === "required") return "Waiting";
  return "Start";
};

export const colors = {
  Start: "tan",
  Waiting: "orange",
  Performed: "teal",
  Declined: "purple",
};
