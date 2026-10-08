# Public guide and client deployment

The public deployment is static documentation plus legacy HTTP 410 responses.
It has no payment proxy, payer key, gateway token or automatic wallet funding.
Pushing the client branch triggered the existing Vercel GitHub integration: its
preview build succeeded. The preview is protected by Vercel Authentication, so
unauthenticated probes cannot establish route behavior there. No production
promotion or funded payment has been performed. Local route checks are separate
from the remaining authenticated preview acceptance.

## Review and test

1. Review the Solana client PR together with gateway PR #3. Run `npm ci`,
   `npm run check`, `npm audit` and the companion gateway integration test.
2. Inspect current GitHub/Vercel deployment identity and source drift before
   changing anything. Record the deployed revision and preserve its rollback
   artifact. Do not deploy from an unrelated dirty checkout.
3. Verify Vercel publishes only `public/` and functions under `api/`; `vercel.json`
   sets that output directory and redirects old root aliases to their retired
   handlers. Express serves only `public/` locally. Verify the configured Vercel
   build settings in a preview before promotion; local tests do not prove those
   platform settings. The repository root is never a public directory.
4. Check `/`, `/docs.html`, `/api/health` and every retired alias in the preview.
   Check that `/.env`, `/client/cli.js`, `/package.json` and saved state are not
   public. There must be no simulated payment or investment completion.
5. Remove the old deployment's SOLANA_SECRET and other signer/funding settings
   during its reviewed replacement. The new public deployment needs no secrets.
   Assess any formerly exposed secrets separately; do not copy them here.

## Gateway activation is separate

Use the shared gateway's `docs/solana-payments.md` and work ledger. Its Solana rail
remains devnet only with existing executable production restrictions. Activation
requires a reviewed endpoint/recipient, explicitly authorized devnet payer and
funded end-to-end evidence, fee-payer support, dependency review, recovery process,
persistent SQLite storage and source/runtime drift checks. The CLI flag expresses
an operator's approval for that request; it is not authorization for an assistant
to spend funds during implementation.

## Rollback

Retain the previous static deployment artifact and exact release identity. Prefer
restoring a documentation-only page while keeping legacy mutation routes retired;
re-enabling old unauthenticated score/mint routes is not a routine rollback.
For the gateway, disable or restore the prior payment configuration/image while
retaining payment DB backups, receipts and uncertain attempts. Never delete the
Solana ledger or client state as a recovery shortcut. No shared agent service or
wiki runtime restart is required for source changes.
