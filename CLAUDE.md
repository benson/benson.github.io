@AGENTS.md

# Claude Code Project Notes

This repo is shared with other agents. Follow the imported `AGENTS.md`
worktree, branch, and dirty-worktree safety rules.

## Store Product Requests

When Benson asks to design, add, price, publish, or troubleshoot a product for
`bensonperry.com/store`, treat it as a frictionless product pipeline task. The
user should be able to give a loose product idea and taste constraints while the
agent handles product mechanics.

Read these files before changing store behavior:

- `store/FRICTIONLESS-PRODUCTS.md`
- `store/README.md`
- `store/EMBEDDED-CHECKOUT.md`

Default to the Stripe plus Printful embedded checkout path. Fourthwall is only a
fallback or historical reference unless Benson explicitly asks for it.

Do not ask Benson to manage file formats, DPI, product JSON, provider
constraints, or checkout wiring. Ask only for taste approval or true blockers
such as account access, credentials, payment details, tax/payout setup, or a
required human purchase/approval.

Before treating a product as buyable, verify that `https://bensonperry.com/store/`
can create a live embedded Stripe checkout session through the same-origin API.
Do not submit a real payment on Benson's behalf.
