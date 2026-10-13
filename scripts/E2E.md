# Local browser transaction verification

The production application has no local signing adapter or signing endpoint.
For authorized testing only, `node scripts/e2e-wallet.mjs --local-test-signing`
starts a separate Vite server at `http://127.0.0.1:5193`. It does not load env
files. It requires disposable CLI identities `ys-stellar-tester`,
`ys-stellar-sponsor`, and `ys-stellar-e2e` in the ignored `.secrets/stellar`
directory. The last identity should be new and funded with official Friendbot
when testing trustline/faucet onboarding. Never use production keys.

Use a browser profile without the Freighter extension. The injected visible
test-wallet panel responds to the actual Freighter API message protocol, while
the application builds, prepares, submits, confirms and reads transactions
through its ordinary Stellar SDK code. This verifies the API boundary, not
the extension's own user interface or permission handling. Do not claim those
extension interactions were tested.

Keys stay server-side. The signer requires exact Testnet passphrase, a known
disposable source matching the requested account, one operation, a deadline
within three minutes, at most one test XLM fee, and a known contract/method
(including pools discovered from the trusted factory). Only the project's
TESTUSD trustline is allowed as a classic operation. Payments and admin
operations are refused. The endpoint checks Host, Origin and a session token;
private repository paths are denied by Vite. Stop the server when done.

`node scripts/verify-dev-deny.mjs` checks normal and `/@fs` requests against a
harmless temporary fixture in `.secrets` for both this harness and the ordinary
dev-server configuration. It never requests a real identity file.

`docs/evidence/e2e/local-wallet.json` (or the file given with
`--evidence docs/evidence/<run>/local-wallet.json`, which keeps each run's log
separate) stores only public source addresses,
contract methods, timestamps and transaction hashes. A signature is not proof
of success: the final readback evidence must independently check each hash.
Never save private keys, seed phrases or signed transaction XDR as evidence.
