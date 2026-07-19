![Version](https://img.shields.io/badge/version-v1.2.1-blue)
![Status](https://img.shields.io/badge/status-Active%20Development-brightgreen)
![Zendesk](https://img.shields.io/badge/Zendesk-Enterprise-03363D)
![Stripe](https://img.shields.io/badge/Stripe-Integrated-635BFF)

# RecastPay Zendesk App

**Version:** v1.2.1  
**Status:** Active Development  
**Platform:** Zendesk Suite Enterprise (Private App)

---

## Purpose

RecastPay Zendesk App is an internal support tool that provides contextual customer, payment and account information directly within Zendesk tickets.

---

## Overview

The goal of this project is to reduce the amount of manual investigation required by Support agents when handling customer enquiries.

Rather than switching between Zendesk, Stripe and internal administration tools, the application aims to present the most relevant customer information directly within the Zendesk ticket sidebar.

The project is being developed as a Zendesk Private App using the Zendesk Apps Framework (ZAF).

---

## Current Features (v1.x)

- ✅ Recast branded Zendesk sidebar application
- ✅ Automatic requester email detection
- ✅ Secure Stripe API integration
- ✅ Stripe Customer lookup
- ✅ Direct links to the Stripe Dashboard
- ✅ Graceful fallback for Guest Customers via Dashboard Search
- ✅ Responsive sidebar UI
- ✅ Version controlled with Git

---

## Current Workflow

```text
Ticket Opened
      │
      ▼
Read Requester Email
      │
      ▼
Search Stripe Customer API
      │
      ├── Customer Found
      │       │
      │       ▼
      │  Display Customer Details
      │
      └── No Customer Found
              │
              ▼
Display Dashboard Search Button
```

---

## Planned Features

### Recast Integration

- Recast User lookup by email
- User ID
- Wallet balance
- Wallet currency
- Recent wallet payments
- Wallet transaction IDs
- Stripe PaymentIntent IDs
- Direct Stripe transaction links

---

### Support Tools

- Refund investigation
- Payment history
- Lookup diagnostics
- Account status
- Playback troubleshooting information
- Manual refresh
- Cached ticket lookups

---

## Architecture (Planned)

```text
Zendesk Ticket
        │
        ▼
Requester Email
        │
        ▼
Recast Lookup Service
        │
        ├── User Information
        ├── Wallet
        ├── Payments
        └── Stripe PaymentIntent
                    │
                    ▼
                 Stripe API
                    │
                    ▼
             Transaction Details
```

---

## Technical Stack

- Zendesk Apps Framework (ZAF)
- JavaScript
- HTML
- CSS
- Stripe REST API
- Git
- GitHub

---

## Project Status

Current Version:

> **v1.2.x**

Status:

> **Prototype / Internal Use**

The current prototype demonstrates that Zendesk can securely integrate with external APIs and present contextual customer information within the ticket interface.

---

## Known Limitations

The Stripe API currently exposes searches for permanent Stripe Customers (`cus_...`) only.

Guest Customers (`gcus_...`) visible within the Stripe Dashboard cannot currently be queried via the public Stripe API.

To provide a better user experience, the application falls back to a one-click Stripe Dashboard search when no permanent customer record exists.

---

## Future Roadmap

### Version 2

- Recast User lookup
- Cached ticket lookups
- Internal API integration

### Version 3

- Wallet information
- Recent payments
- PaymentIntent links
- Refund tools

### Version 4+

- Additional Support tooling
- Internal diagnostics
- Workflow automation

---

## Repository Structure

```
assets/
    app.js
    iframe.html
    style.css
    icons/

translations/
    en.json

manifest.json
README.md
CHANGELOG.md
.gitignore
```

---

## Development

Package the app:

```bash
zcli apps:package .
```

Validate:

```bash
zcli apps:validate .
```

Upload the generated ZIP via the Zendesk Admin Centre.

---

## License

Internal Recast project.

Not intended for public distribution.