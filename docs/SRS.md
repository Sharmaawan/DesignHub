# DesignHub — Software Requirements Specification

| | |
|---|---|
| **Document** | SRS / 001 |
| **Version** | 1.0 |
| **Status** | As-built · Draft |
| **Date** | 07 Jul 2026 |
| **Repository** | Sharmaawan/DesignHub |

A browser-based collaborative design & publishing platform — documented as-built, from the live codebase.

## Table of contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Architecture & Stack](#3-architecture--stack)
4. [Functional Requirements](#4-functional-requirements)
5. [Data Model](#5-data-model)
6. [External Interfaces](#6-external-interfaces)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Known Limitations](#8-known-limitations)

---

## 1. Introduction

### 1.1 Purpose

This specification describes the functional and non-functional requirements of DesignHub *as currently implemented*. It is generated from the live codebase rather than from a pre-build proposal, so it can serve as a shared reference for engineering, QA, and anyone onboarding onto the project.

### 1.2 Scope

DesignHub is a Canva-style graphic design application. It covers multi-page canvas editing (text, image, shape, icon, video, freehand drawing), a shared and personal template library with a recycle bin, AI-assisted copy and image generation, brand asset management, team invitations and project collaboration, and direct publishing to social platforms.

### 1.3 Intended audience

Backend and frontend engineers extending the product; QA engineers writing test plans; stakeholders assessing feature completeness before a release.

### 1.4 Definitions

| Term | Definition |
|---|---|
| Canvas | The per-page editing surface; a design (Project) contains one or more Pages, each holding an ordered list of Elements. |
| Element | A single positioned object on a page — text, image, shape, icon, table, chart, video, or freehand drawing. |
| Template | A starter Project other users can copy; either shared (system-owned) or user-uploaded. |
| Recycle Bin | Soft-deleted state for a user's own templates — reversible until permanently deleted. |
| Magic AI | The in-editor AI panel offering copy generation, image generation, and design-idea suggestions. |
| Publish | Posting a design directly to a connected social account, immediately or on a schedule. |

---

## 2. Overall Description

### 2.1 Product perspective

DesignHub is a single-page web application (React) served independently from a stateless REST API (Express). All persistent state lives in a MySQL database accessed through Prisma; uploaded and generated media are written to local disk and served as static files in this deployment.

### 2.2 User classes

- **Individual creator** — registers, builds designs, uses Magic AI, publishes to their own social accounts.
- **Team member** — accepts an invite, collaborates on shared projects.
- **Team owner/admin** — invites and removes members, manages workspace-level settings including the template recycle bin.

### 2.3 Operating environment

Modern evergreen desktop browsers with Canvas 2D support (Chrome, Edge, Firefox, Safari). The editor's three-panel layout is desktop-first and assumes a viewport of roughly 1024px or wider.

### 2.4 Constraints

AI generation and social publishing depend on externally supplied credentials — an Anthropic and/or OpenAI key per user or deployment, and a registered Meta and LinkedIn developer app. Image generation additionally depends on the connected OpenAI project having the requested model (`gpt-image-1`) enabled, which OpenAI gates behind organization identity verification.

### 2.5 Assumptions & dependencies

Feature availability for AI and social modules tracks the uptime, pricing, and policy of upstream providers (OpenAI, Anthropic, Meta, LinkedIn, Google) — outside DesignHub's control.

---

## 3. Architecture & Stack

Two-package npm workspace: an Express/Prisma API and a React/Vite single-page app, communicating over a versioned REST interface under `/api`.

**Frontend**
- React 18 + TypeScript, Vite 5
- Zustand — client state
- Konva / react-konva — canvas engine
- Tailwind CSS
- react-router-dom, axios, socket.io-client

**Backend**
- Node.js + TypeScript (Express 4)
- Prisma ORM 5 over MySQL
- JWT auth, bcryptjs
- Multer + Sharp — uploads & images
- Nodemailer, Socket.IO server

**Integrations**
- OpenAI — text & image generation
- Anthropic (Claude) — text generation
- Meta Graph API — Facebook & Instagram
- LinkedIn API — posts & analytics
- Google Identity — SSO

**Cross-cutting**
- AES-256 field encryption for stored API keys & OAuth tokens
- Interval-based scheduler for queued social posts
- Soft-delete pattern for templates
- TypeScript strict typecheck as a merge gate

---

## 4. Functional Requirements

Grouped by module. Priority follows MoSCoW: **Must** — core to the product, **Should** — materially valuable and shipped, **Could** — shipped enhancement, **Won't (yet)** — designed for but not functional in this build.

### 4.1 Authentication & Account Management — `/api/auth`

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-01 | Users register with email and password; passwords are hashed with bcrypt, never stored in plain text. | Must |
| FR-AUTH-02 | Users log in and receive a JWT bearer token, required on all subsequent authenticated API calls. | Must |
| FR-AUTH-03 | Users may sign in with Google as an alternative to a password. | Should |
| FR-AUTH-04 | Users view and edit their own profile and change their password. | Must |
| FR-AUTH-05 | Users connect a personal SMTP account so invite and notification emails send under their own address rather than a shared system one. | Should |

### 4.2 Project & Canvas Editor — `/api/projects`

| ID | Requirement | Priority |
|---|---|---|
| FR-EDIT-01 | Users create, open and save multi-page projects; canvas content persists server-side, surviving reload. | Must |
| FR-EDIT-02 | The canvas supports text, image, shape, icon, table, and chart elements, each independently positioned, rotated, scaled and layered. | Must |
| FR-EDIT-03 | Text elements support case transforms, an outline (stroke) with configurable color/width, and placement along a curved arc. | Should |
| FR-EDIT-04 | Image, shape and icon elements support horizontal/vertical flip; image elements additionally support cropping. | Should |
| FR-EDIT-05 | The canvas supports freehand pen and highlighter drawing; the eraser removes only the current user's own drawn strokes, never other elements. | Should |
| FR-EDIT-06 | Users upload and play back video elements on the canvas, with autoplay, loop, mute and replace-source controls. | Should |
| FR-EDIT-07 | The editor provides rulers, a grid overlay, and zoom that holds the visual center fixed rather than drifting. | Should |
| FR-EDIT-08 | Users enter a chrome-free Preview mode showing the design as a viewer would see it. | Should |
| FR-EDIT-09 | The editor offers layers, element animation, and page-transition panels for multi-page sequencing. | Could |

### 4.3 Templates & Recycle Bin — `/api/templates`

| ID | Requirement | Priority |
|---|---|---|
| FR-TPL-01 | Users browse a shared template catalog and start a new design from any entry. | Must |
| FR-TPL-02 | Users upload their own templates, recorded with themselves as owner. | Should |
| FR-TPL-03 | Owners soft-delete their own templates into a recycle bin without affecting the shared catalog or other users' templates. | Should |
| FR-TPL-04 | From Workspace Settings, owners restore a soft-deleted template or permanently delete it. | Should |
| FR-TPL-05 | Users favorite templates for quicker access later. | Could |

### 4.4 Magic AI Studio — `/api/ai`, `/api/ai-settings`

| ID | Requirement | Priority |
|---|---|---|
| FR-AI-01 | Users configure one or more provider API keys (Anthropic, OpenAI); keys are encrypted at rest, never returned in full to the client. | Must |
| FR-AI-02 | Users generate marketing copy from a short prompt ("Magic Write") and insert it directly onto the canvas. | Must |
| FR-AI-03 | Users generate images from a text prompt; when reference images (e.g. a logo or template) are attached, generation incorporates their visual content rather than ignoring them. | Should |
| FR-AI-04 | Users request design-idea suggestions (layout, color, font pairing) from a short brief. | Could |
| FR-AI-05 | Dashboard quick-action shortcuts open the editor directly into the matching AI sub-mode instead of a blank canvas. | Should |
| FR-AI-06 | Users view AI request history and aggregate usage stats (request count, success rate, tokens used). | Could |

### 4.5 Social Publishing — `/api/social`

| ID | Requirement | Priority |
|---|---|---|
| FR-SOC-01 | Users connect Facebook and Instagram accounts via OAuth and publish a design directly to them. | Should |
| FR-SOC-02 | Users connect multiple accounts on the same platform (e.g. a personal profile and a company Page) and choose which to publish to per post. | Should |
| FR-SOC-03 | Users connect a LinkedIn account and publish images or carousels to it. | Should |
| FR-SOC-04 | Users schedule a post for future publication; a background scheduler dispatches it at the scheduled time. | Could |
| FR-SOC-05 | Users view basic engagement analytics for posts published through DesignHub. | Could |
| FR-SOC-06 | Twitter/X and Pinterest publishing — OAuth apps are registered but the platform adapters are stub implementations. | Won't (yet) |

### 4.6 Teams & Collaboration — `/api/teams`, `/collaborators`, `/comments`, `/versions`, `/share-links`

| ID | Requirement | Priority |
|---|---|---|
| FR-TEAM-01 | Team owners invite members by email; pending invites are revocable/deletable before acceptance. | Must |
| FR-TEAM-02 | Projects support named collaborators with role-based access, independent of team membership. | Should |
| FR-TEAM-03 | Projects are shareable via a link, optionally without requiring the recipient to hold an account. | Should |
| FR-TEAM-04 | Users leave threaded, resolvable comments on a project for asynchronous feedback. | Could |
| FR-TEAM-05 | Users save and restore named version snapshots of a project's history. | Could |

### 4.7 Brand Hub — `/api/brand`

| ID | Requirement | Priority |
|---|---|---|
| FR-BRAND-01 | Users maintain a reusable set of brand colors, fonts, logos and starter templates, and pull any of them into a design in progress. | Should |

### 4.8 Notifications & Export — `/api/notifications`, `/api/export`, `/api/activity`

| ID | Requirement | Priority |
|---|---|---|
| FR-NOTIF-01 | Users receive in-app notifications (e.g. team invites) through a notification center. | Should |
| FR-NOTIF-02 | The dashboard surfaces a feed of the user's recent activity (edits, AI generations, exports). | Could |
| FR-EXP-01 | Users export a design and retrieve their export history. | Should |

---

## 5. Data Model

34 Prisma models over MySQL, grouped here by domain. See `packages/backend/prisma/schema.prisma` for full field definitions.

| Domain | Models |
|---|---|
| Identity | User |
| Design | Project, Page, Element, Folder |
| Templates & Assets | Template, Category, Upload, Favorite |
| Collaboration | Team, TeamMember, TeamInvite, Collaborator, ShareLink, Comment, Version, ProjectShare |
| Brand Hub | BrandAsset, UserBrandAsset, BrandColor, BrandFont, BrandLogo, BrandTemplate |
| AI | AISetting, AIRequest, AIGeneration, BackgroundRemoval |
| Social | SocialAccount, SocialPost, SocialPostAnalytics |
| System | Notification, RecentActivity, ExportHistory, UserPreferences, ProductUpdate |

---

## 6. External Interfaces

### 6.1 REST API surface

All routes are mounted under `/api` on the Express app and (aside from registration, login, Google sign-in, category listing, and public share-link resolution) require a JWT bearer token.

| Path | Purpose |
|---|---|
| `/api/auth` | Registration, login, Google SSO, profile & password management |
| `/api/projects` | Create, read, update, list design projects |
| `/api/templates` | Template catalog, upload, soft delete, restore, permanent delete |
| `/api/upload` | Binary file uploads backing images/video/documents |
| `/api/export` | Export a project; retrieve export history |
| `/api/categories` | Template category listing |
| `/api/teams` | Team CRUD, member invites |
| `/api/notifications` | In-app notification center |
| `/api/comments` | Threaded, resolvable project comments |
| `/api/versions` | Named project version snapshots |
| `/api/favorites` | Favorited projects & templates |
| `/api/collaborators` | Per-project collaborator roles |
| `/api/share-links` | Public, token-based project share links |
| `/api/preferences` | Per-user application preferences |
| `/api/activity` | Recent-activity feed |
| `/api/brand` | Brand colors, fonts, logos, assets, templates |
| `/api/ai-settings` | Encrypted per-user AI provider key management |
| `/api/ai` | Text & image generation, generation history, usage stats |
| `/api/product-updates` | "What's new" changelog entries |
| `/api/background-removal` | Background removal on uploaded images |
| `/api/email-settings` | Per-user SMTP credential management |
| `/api/social` | OAuth connect, multi-account management, publish, schedule, analytics |

### 6.2 Third-party integrations

| Provider | Used for | Status |
|---|---|---|
| OpenAI | Text generation, DALL·E / gpt-image-1 image generation (incl. reference-image edits) | Live |
| Anthropic | Claude text generation | Live |
| Meta Graph API | Facebook & Instagram OAuth, publishing, analytics | Live |
| LinkedIn API | OAuth, image/carousel publishing, analytics | Live |
| Google Identity | Sign-in with Google | Live |
| Twitter/X, Pinterest | OAuth apps registered; adapters not implemented | Stub |

---

## 7. Non-Functional Requirements

**Security** — Passwords hashed with bcrypt; all API access gated by JWT; AI provider keys and social OAuth tokens encrypted at rest (AES-256); every route touching another user's data checks resource ownership before acting.

**Data integrity** — Template deletion is soft (recycle bin) for user-owned content, preserving the shared catalog; canvas edits persist to the server rather than only in client memory.

**Reliability** — A dedicated scheduler process polls for due social posts on a fixed interval so publishing survives independent of any single request/response cycle.

**Usability** — Zoom preserves the visual center point; AI quick actions deep-link into the exact sub-mode requested rather than a generic blank state; destructive actions (template/team-member removal) require confirmation and, where applicable, are reversible.

**Maintainability** — Strict TypeScript across both packages with typecheck as a change gate; shared crypto/HTTP helpers factored out of individual routes rather than duplicated.

**Compatibility** — Targets evergreen desktop browsers with Canvas 2D support; the editor's multi-panel layout assumes a desktop-class viewport.

---

## 8. Known Limitations

Documented deliberately rather than left implicit, so scope gaps are visible rather than discovered later:

- Twitter/X and Pinterest publishing are not functional — the OAuth apps exist but `lib/socialPlatforms/twitter.ts` and `pinterest.ts` are stub adapters.
- Dashboard "Duplicate" and "Delete" project actions currently update local client state only and do not call the corresponding project API endpoints — a duplicated or deleted project can reappear after a full data reload.
- Video elements have no trim/timeline UI or per-element volume control; playback uses the source file's full length and default volume.
- `gpt-image-1` image generation additionally requires the connected OpenAI organization to complete identity verification — a gate enforced by OpenAI, outside this application's control.

---

*DesignHub SRS · v1.0 · Generated from the working codebase, 07 Jul 2026*
