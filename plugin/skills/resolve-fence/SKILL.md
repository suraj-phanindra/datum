---
name: resolve-fence
description: Use when a write was just denied by the Datum fence (a PreToolUse deny citing a contract version mismatch or a renamed or changed symbol). Walks through systematic self-correction so the retried write matches current truth.
---

# Resolve fence

The Datum fence denies a write when it would execute against a stale contract: a
teammate changed a column, API shape, or dependency version that your edit still
references. The deny reason names the mechanical change. A deny is not an error; it is
the system catching drift before it reaches merge. Work through it methodically, then
retry.

## Procedure

1. Read the deny reason carefully. It names the contract that moved and the mechanical
   change (for example `users.email` renamed to `contact_email`, migration 0042).
2. Re-sync: call `datum_sync` to pull the current `registry_version`, your latest
   `advisories`, and the `deltas` you had not seen. This brings you to current truth.
3. If you need more detail on the changes, call `datum_deltas_since` with the version
   you were last on to read each mechanical delta in full.
4. Call `datum_my_advisories` to read the arbiter's guidance written for your specific
   task, including which of your references will break and where.
5. Fix every stale reference in your edit: rename the column or symbol, adopt the new
   API shape, or update the dependency version to match the delta.
6. Verify you have caught every occurrence (search the files in your claim for the old
   name or shape), then retry the write.

If the deny reason is unclear or seems wrong, re-sync and re-read the deltas before
retrying. Do not bypass the fence; the deny holds even under skipped permissions, and
working around it reintroduces the drift it caught.
