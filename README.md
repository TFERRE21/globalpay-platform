# GlobalPay Platform

White-label financial services platform scaffold for Brazil-first validation and future international expansion.

## Current status

This repository is a **non-transactional MVP scaffold**. It includes a public landing page and an illustrative simulator only. It does not accept card data, initiate credit, charge cards, issue Pix transfers, approve applications, or connect to Gyroo or any payment provider.

Real financial operations must remain disabled until the provider has approved the business, activity/CNAE, contracts, product flow, and API access.

## Stack

- Node.js 24+
- Express
- Responsive HTML/CSS/vanilla JavaScript
- Docker-ready

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000.

## Environment

Use `.env.example` as the checklist for the hosting platform's environment/secrets panel. Do not commit a real `.env` file or any API keys, JWT secrets, database URLs, customer financial data, or provider secrets.

### Required for the account area

- `DATABASE_URL` or the host-provided `NF_POSTGRESQL_POSTGRES_URI`: persistent PostgreSQL connection.
- `JWT_SECRET`: random secret with at least 32 characters.
- `PUBLIC_BASE_URL`: the real public HTTPS origin, without a trailing slash.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: required for actual password-recovery emails. The sender/domain must be verified in Resend.
- `POSTGRES_SSL=true` only when the database provider requires SSL.

WhatsApp variables are optional and only enable notifications after the Meta Business account, phone number, and any required message templates are approved.

### Deployment smoke test

1. Add the variables in the VPS/hosting environment panel; never paste secret values into chat or GitHub.
2. Redeploy/restart the app so the new environment is loaded.
3. Open `/api/health` and confirm it returns `status: "ok"`.
4. Open `/api/status` and confirm `databaseConfigured: true`.
5. Register a test account, sign out, log in, and open the account page.
6. Request password recovery and verify the email arrives; test the reset link once and confirm it cannot be reused.
7. Submit a test application and verify it appears in the account's application tracking.
8. Remove test records if appropriate and review server logs for errors.

A healthy endpoint alone does not prove email delivery or account flows work; complete the end-to-end checks above.

## Before production

- Confirm legal entity/activity and partner approval in writing.
- Obtain legal and tax review for each market.
- Use provider-hosted card collection or approved PCI-compliant components; never store PAN/CVV.
- Implement authentication, authorization, audit logs, rate limiting, data retention controls, security review, and provider webhook signature verification.
- Replace illustrative values with provider-approved terms and transparent disclosures.
- Add persistent database, monitoring, backups, and production secrets management.
