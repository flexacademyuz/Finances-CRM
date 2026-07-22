# Flex Academy — Financial Telegram Mini-App (Product Spec)

> This is the product specification this repository implements. Source: the
> "AI Development Prompt — Flex Academy Financial Telegram Mini-App" brief.

## 1. Overview

A Telegram Mini-App (Web App running inside Telegram) that manages the finances
of **Flex Academy**, a private English/IELTS/Math learning center. It tracks
student payments, teacher salaries, and class enrollment, and automatically
flags students who owe a payment for the new month. There is no public landing
page — the app opens directly into a role-based dashboard authenticated through
the user's Telegram account.

### Goals
- Give the **CEO** full visibility and control over the center's finances.
- Let the **Accountant** record every payment quickly, with minimal typing.
- Let **Teachers** see their own estimated salary and manage their class rosters.
- Automatically detect and flag students whose monthly payment is overdue.
- Keep a complete, auditable financial history.

### Tech stack (as built)
- **Frontend:** React + TypeScript + Vite, Telegram WebApp SDK, Tailwind styled
  to Telegram light/dark theme variables.
- **Backend:** Node.js + Express (REST), TypeScript ESM.
- **Database:** PostgreSQL via Drizzle ORM.
- **Auth:** Telegram `initData` HMAC verification → Telegram user ID mapped to a
  DB role.
- **Bot:** grammY companion bot to launch the Mini App and push notifications.

## 2. Roles & permissions

| Role | Can do | Cannot do |
|------|--------|-----------|
| **CEO** | Full access: view/edit everything — students, classes, teachers, payments, salaries, reports, user/role management. | — |
| **Accountant** | Record payments; view/edit payment records; view student status & awaiting-payment list; read-only class/teacher lists to select while recording. | Edit teacher salary rules; manage roles; delete historical reports. |
| **Teacher** | View own estimated salary + breakdown; view/manage roster of own classes (add/remove students, see each student's status). | See other teachers' salaries/classes; record payments; see center-wide totals. |

Only the CEO can invite users and assign/change roles (by Telegram username/ID).
Access is enforced both in the UI and **server-side on every request**.

## 3. Core modules

### 3.1 Student & class management
Each student belongs to a class; each class has one assigned teacher. Student:
full name, phone, class, enrollment date, monthly fee (override of class
default), status (Paid / Awaiting Payment / Overdue). CEO & Accountant
create/edit/archive students & classes; Teachers manage only their own rosters.

### 3.2 Payment recording (Accountant)
Prompted in order: **Teacher → Class → Student → Amount (pre-filled with the
effective monthly fee) → Method (Cash/Online)**. The payment date is
auto-assigned to the server time — never entered manually. A confirmation
summary is shown before final save. Each submission creates one immutable
record and flips the student to "Paid" for the current billing month. Only the
CEO can edit/void records, always with an audit trail.

### 3.3 Monthly billing cycle & automation
- On the 1st of each month, active students reset to **Awaiting Payment**
  (unless paid in advance).
- A matching payment → **Paid**, recording the paid-through month.
- Unpaid past a CEO-configurable grace period (default 5 days) → **Overdue**.
- Awaiting/Overdue students appear in a dedicated filterable, sortable list for
  CEO & Accountant. The bot can send a daily digest.

### 3.4 Teacher salary estimation
Per teacher, one of three CEO-configurable models:
- `percentage` — % of collected tuition,
- `per_student` — fixed rate per paid student,
- `fixed` — fixed monthly salary.

Teacher salary screen shows collected total (cash/online), the rule applied, a
per-class breakdown, and a month-by-month history. Only the CEO sees the
aggregate payroll view.

### 3.5 CEO dashboard & reports
Center-wide revenue (cash vs online), student status counts, total students,
payroll obligation, 6-month revenue trend, per-class/per-teacher breakdown,
CSV export, and user & role management.

### 3.6 Notifications (bot)
Payment-recorded alerts to CEO/Accountant; Awaiting/Overdue digest; teacher
salary-finalized notification.

## 4. Data model

`users`, `teachers`, `classes`, `students`, `payments`, `salary_records`,
`settings`. See [`shared/schema.ts`](shared/schema.ts) for the authoritative
Drizzle definitions and enums.

## 5. Key business rules
- A payment belongs to exactly one student, one class, and (via the class) one
  teacher.
- Payment date is always the server's current time.
- Status transitions are automatic (Awaiting → Paid / Overdue; monthly reset).
- Teachers only see data scoped to their own classes.
- Only the CEO can edit historical payments, salary rules, or roles.
- Monetary values stored in **UZS** by default (configurable).

## 6. Required screens
- **CEO:** Dashboard · Students · Classes · Payroll · Payments log · Users.
- **Accountant:** Record Payment · Payments log · Awaiting/Overdue.
- **Teacher:** My Classes · My Salary.

## 7. Non-functional
Runs inside Telegram's Mini App WebView (mobile + desktop); every API call
verified via Telegram `initData` with server-side role checks; bilingual UI
(English + Uzbek); mobile-first theme-matched UI; no hard deletes on payments
(soft void with reason, CEO-approved); fast typeahead select for
Teacher → Class → Student.

## 8. Deliverables
Working bot + Mini App; role-based API + data model; seed script for the first
CEO; automated tests for payment recording & status-transition logic; setup
guide. See [`README.md`](README.md).
