# Milk Tracker

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mothers using Milk Tracker to record pumping sessions. The owner requires gentle, respectful wording in the domain migration flow.

## Product Purpose

Track pumping duration and milk volume and maintain a history. For domain migration, success means users can open the new app and verify their existing records without losing unsaved work. Guests must be able to migrate without Google login.

## Capabilities and Constraints

The existing implementation uses React, Vite, Firebase Auth, Firestore, and an installable PWA. Google and guest sessions are supported. A domain change requires opening and installing the new site; browser storage and notification permissions do not automatically transfer between origins.

The destination is `https://pump.arkaes.dev`, confirmed ready by the owner on October 5, 2026; its HTTPS endpoint returns HTTP 200. The old domain expires on November 10, 2026. Migration stays disabled until the migration build/backend have been verified on the destination before enabling move actions. The confirmed old origin is `https://pump.a-naufal.dev`.

Guest migration preserves the Firebase UID and existing Firestore records through a private, short-lived handoff. Completion requires server verification. Keep source records and local drafts intact on failure. Unit and Firebase emulator integration tests are required implementation deliverables.

## Brand Commitments

Retain Milk Tracker's existing identity and interface conventions. Migration copy should be calm, clear, reassuring, and accurate. Avoid guilt, blame, alarming headlines, patronizing language, or claims of data safety before verification.

## Evidence on Hand

Existing routes and components in `src/`, the product description in `README.md`, existing logo assets in `public/`, and migration requirements in `docs/domain-migration-plan.md`. No commercial proof or medical claims have been supplied for this task.

## Product Principles

Keep users' records accessible. Give one clear next step. Let users pause and return. Confirm success using the server. Explain recovery without blame.
