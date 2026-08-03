---
name: Hardcoded test credentials
description: Credentials left in index.html intentionally for testing — must be removed before final release
---

# Hardcoded Test Credentials

The file `AutoQuizLocal/frontend/index.html` has real school login credentials hardcoded as default `value` attributes on the email and password inputs (lines 15 and 18).

**Why:** User asked to keep them for easy testing during development.

**How to apply:** Before final release or any public sharing, remove the `value="..."` attributes from both inputs and replace with `placeholder="..."` text only.

**Location:** `AutoQuizLocal/frontend/index.html` lines 15 and 18.
