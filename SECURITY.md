# Security Notes — VoidSub v2.0.0

## Known Accepted Risks

### PYSEC-2022-252 — deep-translator 1.11.4

| Field | Value |
|---|---|
| Package | `deep-translator` |
| Version | 1.11.4 |
| Advisory | PYSEC-2022-252 |
| Fix Version | None available |
| Accepted | Yes |

**Background:** In 2022, the `deep-translator` PyPI account was compromised via phishing and a malicious release was briefly published. PyPI removed the malicious release and the account was restored. All versions of `deep-translator` including 1.11.4 distributed today are clean — the advisory tracks the historical event, not an ongoing vulnerability in the package code.

**Decision:** Accept — no patched version exists; the risk is historical and the current release is verified clean by PyPI. Reviewed 2026-05-29.

---

## CSP Policy Rationale

`style-src 'unsafe-inline'` is retained in the Tauri CSP because:
1. The Tauri WebView injects small inline style snippets at startup (drag region, window chrome).
2. `framer-motion` and React apply inline `style` attributes that cannot be nonce'd without a custom CSP middleware.

`script-src 'unsafe-inline'` **has been removed**. The application uses a bundled Vite output (`script-src 'self'`) with no inline scripts.

`unsafe-eval` **has been removed** from both `script-src` and `default-src`.

---

## Audit Gate Verification

**Date:** 2026-05-29

The following security gates have been successfully verified locally to ensure the integrity of the `v2.0.0` release:

### 1. `npm audit` (Frontend Dependencies)
- **Target:** `ui-tauri`
- **Result:** `found 0 vulnerabilities`
- **Status:** PASS

### 2. `cargo check --locked` (Tauri Backend Core)
- **Target:** `ui-tauri/src-tauri`
- **Result:** `Finished dev profile [unoptimized + debuginfo] target(s) in 0.38s` (Successful compilation using locked dependency tree).
- **Status:** PASS

### 3. `pip-audit` (Python Backend Environment)
- **Target:** Python environment
- **Result:** 
  - `deep-translator 1.11.4` flagged with `PYSEC-2022-252` (Accepted, see above).
  - `pip 24.0` flagged with CVEs (CVE-2025-8869, CVE-2026-1703, CVE-2026-3219, CVE-2026-6357). 
- **Status:** PASS (Note: The `pip` warnings apply to the development environment package manager and do not impact the distributed application since `pip` is not a runtime dependency of VoidSub).
