# Documents Domain

## Purpose

Attach source documents (loan sanction letters, insurance policy PDFs,
property deeds, statements) to the corresponding financial record, so a
user can find the paperwork behind a number without leaving Artha. Not
built today; described here per `Artha.md`'s vision ("Documents can be
stored externally with references inside SQLite"), not as a shipped
capability.

## Scope

None — confirmed via repo-wide search: no file-upload/attachment
route, no document-reference column, no document-viewer component
exists anywhere in the codebase. (Two components, `Reports.tsx` and
`EmiCalculator.tsx`, matched a grep for "document" purely because they
contain the word "document" in unrelated contexts — e.g. browser
`document` DOM references — not because they implement this domain.)

## Out of Scope

Everything, since nothing exists. If built, per `Artha.md`'s stated
approach: documents should be stored externally (filesystem, not as
SQLite BLOBs) with only a path/reference stored in the database — this
keeps the portable `.db` file small and fast to back up, at the cost of
needing to keep the referenced files alongside it (a real trade-off to
document for users if implemented, since a `.db`-only backup would then
be incomplete).

## Business Objectives

If built: reduce the need for a separate document-management habit
alongside Artha — e.g. attach a policy PDF directly to its
`insurance_details` row, or a loan sanction letter to its `liabilities`
row.

## Data Model

None exists. If built, the natural shape (not committed) is a generic
`documents` table with a polymorphic reference (similar to
`transactions.source_ref_type`/`source_ref_id` — see
`05-Database-Architecture.md`) pointing at any entity (`assets`,
`liabilities`, `accounts`, `goals`), rather than a bespoke document-link
column added to every table individually.

## Database Schema

None.

## Business Rules

None.

## Configuration

None. If built, a configurable storage location (alongside the existing
`custom_backup_dir` setting pattern in `~/.financeos/settings.json` —
see `10-Configuration-Architecture.md`) would let users choose where
attached documents live, consistent with the portable-app design goal.

## UI Structure

None.

## API Contracts

None.

## AI Responsibilities

None exist today (see `07-AI-Architecture.md`). If built, document
OCR/summarization ("what does this policy actually cover") would be a
plausible future AI "explain" use case — but this is speculative, not
scoped.

## Reports

None.

## Future Enhancements

Document attachment on any entity, external file storage with a
SQLite-stored reference path, and (further out) OCR/text-extraction to
make attached documents searchable. This is a self-contained new
capability rather than an extension of an existing domain — it would
touch the entity model generically (any table could have documents
attached) rather than living inside one specific `Domains/*.md` file.
