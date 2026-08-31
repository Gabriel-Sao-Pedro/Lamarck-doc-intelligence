# Lamarck DOC Intelligence — Project Context

> Operational context shared by Claude and Codex.
> This file summarizes decisions already made by the project owner.
> It does **not** replace `docs/specification.md`, `docs/architecture.md` or ADRs.
> If this file conflicts with those human-owned documents, stop and ask for clarification.

## 1. Goal

Build the backend track of the DOC Intelligence challenge.

The delivery prioritizes:
- architecture and modularity;
- traceable decisions;
- controlled use of AI agents;
- specification before implementation;
- one honest vertical slice before broader product coverage.

Project name: `Lamarck-doc-intelligence`.

## 2. Stack

- TypeScript
- Node.js
- NestJS
- Prisma ORM
- PostgreSQL
- Docker Compose
- REST API
- npm

Development model:
- NestJS application runs locally with npm.
- PostgreSQL runs through Docker Compose.

## 3. Initial document type

Phase 1 uses one fictional identity document type:

`IDENTITY_DOCUMENT`

Required fields:
- `fullName`
- `parentage`
- `birthDate`
- `documentNumber`
- `issuingAuthority`

Only fictitious documents may be used in tests and examples.

## 4. Upload

Phase 1 accepts:
- JPG
- JPEG
- PNG

Maximum file size:
- 10 MB

The 10 MB limit must be enforced at the multipart upload/parser boundary before
accepting an arbitrarily large file into memory. Content/type validation still
happens after that initial limit check.

Phase 2 adds:
- PDF

Planned endpoint:

`POST /documents`

Expected behavior:
1. receive multipart upload;
2. enforce upload size limit;
3. validate actual content/type, not only file extension;
4. calculate SHA-256 over received bytes;
5. check exact binary duplication;
6. store the original document;
7. create `Document` and `ProcessingJob` in the same PostgreSQL transaction;
8. return immediately without waiting for intelligence processing.

HTTP response:
- use `202 Accepted` for a new document;
- current project decision is to also return `202 Accepted` for an exact duplicate while returning the existing document reference.

This duplicate-response decision is intentional but may be revisited later through an ADR/implementation note.

## 5. Deduplication

Phase 1:
- exact deduplication by SHA-256 of the raw bytes.

If the hash already exists:
- do not create a second document;
- do not create a second processing job;
- return the existing document reference.

Known limitation:
SHA-256 does not identify the same physical document when it is:
- photographed again;
- recompressed;
- resized;
- regenerated as PDF;
- otherwise changed at byte level.

Perceptual/semantic duplicate detection is not Phase 1.

## 6. Async processing

Processing must be asynchronous.

Reason:
the external multimodal provider in the target system may take 5–40 seconds and may fail or stop responding.

Phase 1 queue:
- PostgreSQL-backed persistent job queue.

Do not add in Phase 1:
- Redis
- RabbitMQ
- Kafka
- SQS

`Document` and `ProcessingJob` are created in the same database transaction so a
document cannot remain persisted in `RECEIVED` without a job because of a
partial database write.

The implementation must prevent two workers from processing the same job at the same time.

Operational retry source of truth:
- `ProcessingJob.attemptCount`.

Historical record:
- each started attempt creates a `ProcessingRun` with the same attempt number.

Do not derive the retry limit by counting `ProcessingRun` rows.

Job claiming should be short and atomic:
- claim the job;
- increment `attemptCount`;
- create the matching `ProcessingRun`;
- update the document state consistently;
- commit before calling the provider.

The project contains PostgreSQL concurrency guidance intended for:
- transactions;
- row locking;
- `FOR UPDATE SKIP LOCKED`;
- short transactions;
- deadlock prevention;
- atomic claiming.

Expired leases:
- no separate reaper is required in Phase 1;
- the worker claim query also considers jobs whose lease has expired;
- when a stale job is found, the previous attempt is treated as technical failure;
- if retries remain, transition `PROCESSING -> RETRYING -> PROCESSING`;
- if the limit is exhausted, transition `PROCESSING -> RETRYING -> FAILED`;
- until another worker performs this check, `Document.status` may still show `PROCESSING`, while the expired lease is the operational signal that the job is recoverable.

The lease duration must be longer than the provider timeout plus a safety margin.

A worker that lost lease ownership must not persist the final result without
first proving that its claim is still valid.

## 7. State machine

Valid states:

- `RECEIVED`
- `PROCESSING`
- `RETRYING`
- `COMPLETED`
- `NEEDS_REVIEW`
- `FAILED`

Initially allowed transitions:

- `RECEIVED -> PROCESSING`
- `PROCESSING -> COMPLETED`
- `PROCESSING -> NEEDS_REVIEW`
- `PROCESSING -> RETRYING`
- `RETRYING -> PROCESSING`
- `RETRYING -> FAILED`

Do not introduce new transitions silently.

## 8. Retry policy

Maximum:
- 3 total attempts, including the first attempt.

Technical/provider failure:
- retry.

Semantic inconsistency:
- `NEEDS_REVIEW`.

After the third failed technical attempt:
- `FAILED`.

A worker loss after an attempt has started counts as a technical failure for
that attempt.

Do not hold a database lock while waiting for the external intelligence provider.

## 9. Intelligence provider boundary

The application must depend on an abstraction such as:

`DocumentIntelligenceProvider`

Phase 1 implementation:
- `FakeDocumentIntelligenceProvider`

The fake should support controlled scenarios:
- success;
- semantic inconsistency;
- technical failure.

A real multimodal provider is Phase 3.

## 10. Validation

Two-stage validation is planned.

### Check 1 — deterministic
Validate:
- required fields;
- types;
- formats;
- structural validity.

### Check 2 — document verification
Verify that extracted values are supported by the document.

Only when both checks pass:
- `COMPLETED`.

Otherwise:
- `NEEDS_REVIEW`.

A filled field is not automatically a correct field.

## 11. Persistence

Planned entities:
- `Document`
- `ProcessingJob`
- `ProcessingRun`
- `DocumentResult`

`ProcessingRun` is historical and immutable.

A processing run should preserve enough provenance to explain how a result was produced, including:
- provider;
- model;
- model version;
- prompt identifier/version/hash;
- output schema version;
- attempt;
- status;
- started/finished timestamps.

Reprocessing creates a new run.
Do not overwrite old runs.

## 12. File storage

Use a boundary such as:

`DocumentStorage`

Phase 1:
- `LocalDocumentStorage`

PostgreSQL stores structured metadata and a storage key.
Do not store the complete document blob in PostgreSQL.

The user-provided filename must never be used directly as a filesystem path.

Potential production evolution:
- object storage/S3-compatible adapter.

## 13. Security baseline

Never put the following into logs:
- document contents;
- extracted document fields;
- person's name;
- document number;
- sensitive/personal data.

Also:
- enforce upload size at the parser boundary;
- treat uploads as untrusted input;
- validate actual file type;
- enforce size limit;
- keep `.env` and secrets out of Git;
- use only fictitious documents;
- use internal generated storage identifiers;
- avoid path traversal;
- keep PostgreSQL and stored files non-public.

Authentication is not fully implemented in Phase 1.

## 14. Phase 1 — mandatory vertical slice

Phase 1 must be independently deliverable.

Required path:

upload image
-> validate
-> SHA-256
-> deduplicate
-> persist document and processing job atomically
-> return 202
-> worker claims job atomically
-> fake provider
-> checks
-> immutable processing run
-> persist result
-> expose result through `GET /documents/:id`

Phase 1 also requires:
- selected automated tests;
- build/lint/test passing;
- PostgreSQL reproducible through Docker Compose;
- README instructions that another person can follow.

## 15. Phase 2 — planned extension

After Phase 1 is stable:

- PDF support;
- `GET /documents` with pagination/filter;
- minimal service-to-service API key;
- OpenAPI/Swagger;
- additional upload/security hardening;
- broader tests.

Stretch only if time remains:
- `Idempotency-Key`.

Phase 2 must never destabilize Phase 1.

## 16. Phase 3 — remainder of product target

Phase 3 may add:

- real document classification;
- standardized filename suggestion;
- real multimodal provider adapter;
- human review queue;
- correction of extracted fields;
- review claim/lease;
- optimistic locking/versioning and `409 Conflict`;
- audit trail for human corrections;
- a second document type to prove extensibility;
- explicit reprocessing endpoint;
- stronger service-to-service security and operational hardening.

Phase 3 is secondary to a stable, tested, documented delivery.

## 17. Ownership and parallel work

Claude and Codex work on different areas.

### Claude — primary ownership
- project foundation;
- NestJS wiring;
- Prisma/Docker foundation;
- ingestion/API;
- uploads;
- storage;
- SHA-256;
- deduplication;
- Phase 2 API work;
- OpenAPI;
- API-key implementation.

### Codex — primary ownership
- processing module;
- job claiming;
- worker;
- state machine;
- retries;
- processing history;
- result validation;
- review/concurrency work in Phase 3.

### Initial Prisma schema ownership

Claude owns the first complete version of:
- `prisma/schema.prisma`;
- the initial migration.

That first schema must include the shared models already defined by the human
documents:
- `Document`;
- `ProcessingJob`;
- `ProcessingRun`;
- `DocumentResult`;
- shared enums required by the initial state machine.

Codex reviews the processing-related models before implementing its module.

If Codex believes the shared schema or migration must change:
1. describe the required change;
2. explain its impact;
3. stop and wait for approval.

Claude and Codex must not edit the shared Prisma schema/migrations in parallel.

### Shared-contract rule

No agent may silently change:
- Prisma shared models;
- shared enums;
- API contracts;
- state machine;
- cross-module interfaces;
- migration strategy;
- shared DTO contracts.

If a change is needed:
1. describe the problem;
2. propose alternatives;
3. stop and wait for approval.

## 18. Cross-review

After implementation work is pushed:
- Codex reviews Claude-owned changes;
- Claude reviews Codex-owned changes.

First review must be read-only.

Each finding must contain:
- severity;
- file/location;
- problem;
- reproduction/failure scenario;
- impact;
- suggested correction;
- whether it is confirmed or hypothetical.

Do not manufacture defects for documentation.

## 19. Implementation order

Project workflow:

1. specify;
2. implement;
3. push branch;
4. run/observe tests and CI;
5. cross-review;
6. document real failures;
7. correct;
8. rerun;
9. merge only after validation.

Testing after the initial push is intentional because real failures should be preserved as engineering evidence when they occur.

Never mark something as passing if it was not executed.

## 20. Human-owned documents

These are owned by the project owner and must not be rewritten by an agent without explicit permission:

- `docs/specification.md`
- `docs/architecture.md`
- ADRs under `docs/decisions/`
- closing letter

Agents may:
- point out contradictions;
- ask questions;
- propose amendments.

Agents may not silently rewrite history.

## 21. AI traceability

All agent use that materially affects the project must remain traceable.

Keep:
- agent instruction files;
- project skills;
- MCP configuration actually used;
- prompts in full and chronological order;
- task reports;
- actual AI mistakes and how they were detected/corrected.

Do not rewrite old prompts to make them look cleaner.

## 22. Stop conditions

Stop and ask before:
- adding structural dependencies;
- introducing a broker;
- changing database technology;
- changing the state machine;
- changing the API contract;
- changing shared Prisma models owned by another agent;
- expanding beyond the assigned phase/task;
- replacing a documented architectural decision.
