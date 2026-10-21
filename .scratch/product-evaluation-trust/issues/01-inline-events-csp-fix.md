# 01-inline-events-csp-fix

Status: closed
Labels: security, ui, csp

Blocked by: 

## Description
Replace all inline event handlers (`onclick`, `onchange`, etc.) in HTML templates and script-generated HTML with registered JavaScript listeners using event delegation and DOM APIs. Ensure safe rendering of text and validated links to prevent XSS and comply with Chrome Extension Manifest V3 CSP.

## Acceptance Criteria
- [x] No `onclick`, `onchange`, or other inline event attributes in `ui/dashboard.html`, `ui/sidepanel.html`, `ui/js/dashboard.js`, `ui/js/sidepanel.js`, and `content/inpage_badge.js`.
- [x] Event listeners are attached via `addEventListener` or event delegation on static parent containers.
- [x] Dynamic links (`href`) validate protocol (`http:`, `https:`) before rendering.
- [x] User-provided text strings are escaped or set via `textContent`.
- [x] Browser console throws zero CSP inline-script violation warnings.

## Comments
- Replaced all inline handlers across dashboard, sidepanel, and content script badges with event delegation and `addEventListener`.
- Implemented `escapeHtml` and `sanitizeUrl` helpers for link and text sanitization.
- Verified zero inline handlers via automated regex scan in `tests/csp.test.js`.
