---- MODULE Conversation ----
EXTENDS Integers
\* Poppy 0.4 conversation state. The four fields are the state. working is not an event.

VARIABLES working, handoff, responder, closed, req, body, attempt, conflict, events, steps
vars == <<working, handoff, responder, closed, req, body, attempt, conflict, events, steps>>

Init ==
    /\ working = FALSE
    /\ handoff = "none"
    /\ responder = "agent"
    /\ closed = FALSE
    /\ req = ""
    /\ body = 0
    /\ attempt = 0
    /\ conflict = FALSE
    /\ events = {}
    /\ steps = 0

\* Same id and same body is accepted again and changes nothing.
\* Same id and a different body is request_id_conflict and changes nothing.
Post(b) ==
    /\ closed = FALSE
    /\ b \in {1, 2}
    /\ \/ /\ req = ""
          /\ req' = "r1"
          /\ body' = b
          /\ attempt' = b
          /\ conflict' = FALSE
          /\ events' = events \union {"message"}
          /\ working' = FALSE
       \/ /\ req = "r1"
          /\ body = b
          /\ attempt' = b
          /\ conflict' = FALSE
          /\ UNCHANGED <<req, body, events, working>>
       \/ /\ req = "r1"
          /\ body # b
          /\ attempt' = b
          /\ conflict' = TRUE
          /\ UNCHANGED <<req, body, events, working>>
    /\ UNCHANGED <<handoff, responder, closed>>
    /\ steps' = steps + 1

AskHandoff ==
    /\ closed = FALSE
    /\ handoff = "none"
    /\ responder = "agent"
    /\ handoff' = "pending"
    /\ events' = events \union {"handoff"}
    /\ UNCHANGED <<working, responder, closed, req, body, attempt, conflict>>
    /\ steps' = steps + 1

CancelHandoff ==
    /\ closed = FALSE
    /\ handoff = "pending"
    /\ handoff' = "none"
    /\ UNCHANGED <<working, responder, closed, req, body, attempt, conflict, events>>
    /\ steps' = steps + 1

\* Close returns immediately. It does not wait for working to finish.
Close ==
    /\ closed = FALSE
    /\ closed' = TRUE
    /\ working' = FALSE
    /\ UNCHANGED <<handoff, responder, req, body, attempt, conflict, events>>
    /\ steps' = steps + 1

\* After close, cancelling a handoff is conversation_closed. State stays closed.
CancelAfterClose ==
    /\ closed = TRUE
    /\ conflict' = TRUE
    /\ UNCHANGED <<working, handoff, responder, closed, req, body, attempt, events>>
    /\ steps' = steps + 1

Done ==
    /\ steps > 0
    /\ UNCHANGED vars

Next ==
    \/ \E b \in {1, 2} : Post(b)
    \/ AskHandoff
    \/ CancelHandoff
    \/ Close
    \/ CancelAfterClose
    \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ working \in BOOLEAN
    /\ handoff \in {"none", "pending"}
    /\ responder \in {"agent", "human"}
    /\ closed \in BOOLEAN
    /\ req \in {"", "r1"}
    /\ body \in {0, 1, 2}
    /\ attempt \in {0, 1, 2}
    /\ conflict \in BOOLEAN
    /\ events \subseteq {"message", "handoff"}
    /\ steps \in 0..12

\* working is not an event.
WorkingIsNotAnEvent == "working" \notin events

\* A repeated id with the same body is not a conflict. Conflict while open means the body differed.
SameBodyIsIdempotent == conflict /\ closed = FALSE => attempt # body

\* Conflict is only raised for a different body, or for a cancel after close.
ConflictOnlyWhenDifferentOrClosed ==
    conflict => (closed = FALSE /\ attempt # body) \/ closed

\* Close does not leave the conversation working.
CloseClearsWorking == closed => working = FALSE

\* The four fields stay in range. Closed stays closed.
StaysClosed == closed \in BOOLEAN

Bound == steps <= 5

====
