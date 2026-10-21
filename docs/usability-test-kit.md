# Usability test kit (UX 11)

How to run the eight UX 11 scenarios with real staff against the mock API, before the real API is ready.
The mock data lives in the browser tab: close the tab (or open a new one) to start each participant afresh.

## Setup

1. `npm start`, then open `http://localhost:4200` in a fresh browser tab per participant.
2. Desktop scenarios at 1366x768 or larger; scenario 2 also on a tablet, as field staff would use it.
3. Note time on task, errors, help requests, and whether people read the status chips correctly (UX 11).

Sign-ins (mock only, see `docs/ci.md`): `TELLER1` / `Teller-Pass1`, `KYC1` / `Kyc-Pass1`, `FIELD1` / `Field-Pass1`,
`ADMIN` / `Admin-Pass1` (asks for a new password first).

## Scenarios

| #   | Scenario                                                            | Sign in as | Data and steps to give the participant                                                                                      | Target                                            |
| --- | ------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Find a customer from a partial name, then from a mobile number      | TELLER1    | "Find Akosua Darko", then "find the customer whose mobile is 024 400 0101"                                                  | Under 10 seconds each, no help                    |
| 2   | Onboard an individual to a complete checklist, photo included       | FIELD1     | New customer > Individual, any made-up person over 18 with a Ghana Card number; take or upload a photo                      | Under 6 minutes, no errors left unfixed           |
| 3   | Open a joint account                                                | TELLER1    | Regular savings for Akosua Darko (primary) and Adjoa Boakye (joint), either to sign                                         | Under 3 minutes, correct holders and mode         |
| 4   | Supervisor approves 10 items from the inbox                         | ADMIN      | Approvals: customers, accounts, products, chart of accounts; some are the participant's own and must be left                | Under 4 minutes, nothing approved by mistake      |
| 5   | KYC officer verifies one customer and rejects another with a reason | KYC1       | Approvals > Customers: verify one, reject another with a reason                                                             | Under 3 minutes each                              |
| 6   | Administrator creates a teller with the right permissions           | ADMIN      | Staff > New staff member, teller with till 1001001, then the Teller role group in Head Office                               | Under 5 minutes, permissions match intent         |
| 7   | Session expires mid-form, user signs back in                        | TELLER1    | Start a new customer; the facilitator runs `__ibMock.endSessions('auth.session-timed-out')` in the browser console          | No data lost, user understands what happened      |
| 8   | Network drops during account opening                                | TELLER1    | Fill Open account; the facilitator sets DevTools > Network to Offline just before Open account is pressed, then back online | User checks before retrying, no duplicate account |

## After each session

Record findings against the screen and step. A change that alters wording or flow goes back into the UX design
document first, then into the portal.
