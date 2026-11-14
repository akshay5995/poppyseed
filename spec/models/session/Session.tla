---- MODULE Session ----
EXTENDS Integers
\* Poppy 0.4 session lifecycle. Rules are invariants. Constants stay small.

VARIABLES phase, refresh, dpop, endedHow, sid, otherUsed, steps
vars == <<phase, refresh, dpop, endedHow, sid, otherUsed, steps>>

Phases == {"none", "signedOut", "signedIn", "ended"}

Init ==
    /\ phase = "none"
    /\ refresh = "none"
    /\ dpop = "old"
    /\ endedHow = "no"
    /\ sid = 1
    /\ otherUsed = FALSE
    /\ steps = 0

Start ==
    /\ phase = "none"
    /\ phase' = "signedOut"
    /\ UNCHANGED <<refresh, dpop, endedHow, sid, otherUsed>>
    /\ steps' = steps + 1

\* Direct, device, and mediated all issue a refresh token that is not tied to a sid.
SignIn ==
    /\ phase = "signedOut"
    /\ refresh # "revoked"
    /\ phase' = "signedIn"
    /\ refresh' = "valid"
    /\ dpop' = "old"
    /\ UNCHANGED <<endedHow, sid, otherUsed>>
    /\ steps' = steps + 1

\* A new DPoP key on refresh is allowed. The refresh token is not tied to one sid,
\* so this action does not read which sid is current.
RefreshNewKey ==
    /\ refresh = "valid"
    /\ phase \in {"signedOut", "signedIn"}
    /\ phase' = "signedIn"
    /\ dpop' = "new"
    /\ UNCHANGED <<refresh, endedHow, sid, otherUsed>>
    /\ steps' = steps + 1

\* The same refresh token signs in a second sid. It is not bound to the first one.
RefreshOtherSid ==
    /\ refresh = "valid"
    /\ phase \in {"signedOut", "signedIn"}
    /\ sid' = 2
    /\ otherUsed' = TRUE
    /\ phase' = "signedIn"
    /\ UNCHANGED <<refresh, dpop, endedHow>>
    /\ steps' = steps + 1

\* Sign-out revokes the refresh token. The session continues signed out.
SignOut ==
    /\ refresh = "valid"
    /\ phase \in {"signedOut", "signedIn"}
    /\ refresh' = "revoked"
    /\ phase' = "signedOut"
    /\ UNCHANGED <<dpop, endedHow, sid, otherUsed>>
    /\ steps' = steps + 1

\* A later request still has a session: Poppy-Session and no access token.
UseSignedOut ==
    /\ phase = "signedOut"
    /\ refresh = "revoked"
    /\ UNCHANGED <<phase, refresh, dpop, endedHow, sid, otherUsed>>
    /\ steps' = steps + 1

\* The company ends the session itself. Sign-out is not this action.
CompanyEnds ==
    /\ phase \in {"signedOut", "signedIn"}
    /\ phase' = "ended"
    /\ endedHow' = "company"
    /\ UNCHANGED <<refresh, dpop, sid, otherUsed>>
    /\ steps' = steps + 1

Done ==
    /\ phase \in {"signedOut", "signedIn", "ended"}
    /\ UNCHANGED vars

Next ==
    \/ Start
    \/ SignIn
    \/ RefreshNewKey
    \/ RefreshOtherSid
    \/ SignOut
    \/ UseSignedOut
    \/ CompanyEnds
    \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ phase \in Phases
    /\ refresh \in {"none", "valid", "revoked"}
    /\ dpop \in {"old", "new"}
    /\ endedHow \in {"no", "company"}
    /\ sid \in {1, 2}
    /\ otherUsed \in BOOLEAN
    /\ steps \in 0..12

\* A second sid can use the same refresh token. While that token is still valid
\* and the company has not ended the session, that use leaves the caller signed in.
\* Sign-out afterwards revokes the token; it does not undo the fact that the other sid worked.
RefreshNotTiedToSession ==
    otherUsed /\ refresh = "valid" /\ endedHow = "no" => phase = "signedIn" /\ sid = 2

\* Refresh may present a proof from a new DPoP key. "new" is a legal binding.
NewDpopKeyAllowed == dpop \in {"old", "new"}

\* While signed in, the refresh token is still valid.
SignedInHasRefresh == phase = "signedIn" => refresh = "valid"

\* Revoking the refresh token leaves the session signed out. Only a later company
\* end moves it to ended. Sign-out itself never sets endedHow.
SignOutContinuesSession == refresh = "revoked" /\ endedHow = "no" => phase = "signedOut"

\* An ended session was ended by the company, not by revoking a refresh token.
EndedOnlyByCompany == phase = "ended" => endedHow = "company"

Bound == steps <= 6

====
