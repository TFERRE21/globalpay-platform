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

Copy `.env.example` to `.env` and configure only non-sensitive runtime settings. Never commit API keys, tokens, customer financial data, or provider secrets.

## Before production

- Confirm legal entity/activity and partner approval in writing.
- Obtain legal and tax review for each market.
- Use provider-hosted card collection or approved PCI-compliant components; never store PAN/CVV.
- Implement authentication, authorization, audit logs, rate limiting, data retention controls, security review, and provider webhook signature verification.
- Replace illustrative values with provider-approved terms and transparent disclosures.
- Add persistent database, monitoring, backups, and production secrets management.
