# VERUN agent integration

Use the shared ASP gateway's MCP tools. Only `search_opportunities` buys a scan.
Opportunity details, explicit mandate checks and handoff preparation are free;
provider eligibility and approval remain separate. Payment never places an
investment. There are no VERUN validator votes, score gates or SBT permissions.

1. Prepare the user's search criteria and a stable request ID. Request access
   requirements without initiating payment.
2. Respect the user's payment authority. Sign locally under the approved devnet
   mint/network/recipient/amount policy; never put private keys, bearer tokens or
   Payment-Signature payloads in prompts, logs, Slack or tickets.
3. Send the identical search and local signed payload through the REST scan route
   or `search_opportunities`. Treat scan completion and payment completion as
   separate facts. Report actual catalog results, including an empty result.
4. On uncertainty, use free `get_payment_status` and retry the same stored signed
   request. Never invent a new ID or re-sign to bypass a reconciliation lock.
5. After discovery, use free detail/mandate/handoff tools. Do not claim that a paid
   scan grants investment authority or proves provider onboarding is complete.

The local CLI in this repository implements the payer flow for a reviewed gateway.
See README for setup and recovery. Public demo routes do not hold credentials or
proxy paid scans. Retired legacy endpoints return 410 and must not be retried as
score-based approval APIs.
