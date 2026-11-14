---- MODULE Operations ----
EXTENDS Integers
\* Poppy 0.4 operations extension version 3.

VARIABLES st, terms, performs, revision, approver, steps
vars == <<st, terms, performs, revision, approver, steps>>

Init ==
    /\ st = "idle"
    /\ terms = FALSE
    /\ performs = 0
    /\ revision = 0
    /\ approver = ""
    /\ steps = 0

\* A proposal without terms is not a legal operation. This action is absent on purpose.
Propose ==
    /\ st = "idle"
    /\ st' = "required"
    /\ terms' = TRUE
    /\ revision' = 1
    /\ UNCHANGED <<performs, approver>>
    /\ steps' = steps + 1

\* New terms need a new revision. A reworded summary would keep the revision; this action changes terms.
Revise ==
    /\ st = "required"
    /\ terms = TRUE
    /\ revision' = revision + 1
    /\ UNCHANGED <<st, terms, performs, approver>>
    /\ steps' = steps + 1

\* approver is user or agent. Optional members are not read, so a missing one still approves.
Approve(who) ==
    /\ st = "required"
    /\ terms = TRUE
    /\ who \in {"user", "agent"}
    /\ st' = "done"
    /\ performs' = performs + 1
    /\ approver' = who
    /\ UNCHANGED <<terms, revision>>
    /\ steps' = steps + 1

\* A second approval of the same revision does not perform again.
ApproveAgain ==
    /\ st = "done"
    /\ performs = 1
    /\ UNCHANGED <<st, terms, performs, revision, approver>>
    /\ steps' = steps + 1

Decline ==
    /\ st = "required"
    /\ terms = TRUE
    /\ st' = "declined"
    /\ UNCHANGED <<terms, performs, revision, approver>>
    /\ steps' = steps + 1

Done ==
    /\ st \in {"done", "declined", "required"}
    /\ UNCHANGED vars

Next ==
    \/ Propose
    \/ Revise
    \/ \E who \in {"user", "agent"} : Approve(who)
    \/ ApproveAgain
    \/ Decline
    \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ st \in {"idle", "required", "done", "declined"}
    /\ terms \in BOOLEAN
    /\ performs \in {0, 1}
    /\ revision \in 0..8
    /\ approver \in {"", "user", "agent"}
    /\ steps \in 0..12

\* terms is required once an operation exists.
TermsRequired == st # "idle" => terms

\* The company performs a revision at most once.
AtMostOnce == performs <= 1

\* A decline performs nothing.
DeclinePerformsNothing == st = "declined" => performs = 0

\* Approval names user or agent.
ApproverIsUserOrAgent == st = "done" => approver \in {"user", "agent"}

\* A new revision is a different number. The performed count does not rise on revise.
ReviseDoesNotPerform == st = "required" => performs = 0

Bound == steps <= 5

====
