# 07-evidence-dossier-and-ui

Status: closed
Labels: ui, dashboard, sidepanel

Blocked by: 01, 03, 05

## Description
Build the Evidence Dossier interface in the dashboard and sidepanel to allow operators to review and input structured evidence (sourcing quote details, demand keywords & searches, Rocket share audit, seller reviews, intermediate price review, KC risk verification). Update table filters and metric summary pills to filter by trial eligibility (`needs_verification`, `not_eligible`, `ready_for_trial`) and outstanding conditions. Support distinct saving of scenarios vs baselines in the simulator.

## Acceptance Criteria
- [x] Dossier modal/drawer allows operator to input, view, and save evidence for sourcing quotes, search demand, Rocket audits, seller reviews, intermediate price notes, and KC risk reviews.
- [x] Products can be filtered by verification/eligibility status (`ready_for_trial`, `needs_verification`, `not_eligible`) and outstanding conditions.
- [x] Metric summary pills highlight Trial Ready, Needs Verification, and Not Eligible counts instead of claiming high scores mean ready to sell.
- [x] Simulator allows testing scenarios without mutating the baseline product unless the operator explicitly saves it.
- [x] All user inputs are rendered safely (escaped text, validated links).

## Comments
- Implemented `#dossierModal` in `ui/dashboard.html` and controller in `ui/js/dashboard.js`.
- Implemented eligibility filter buttons and metrics strip reflecting trial readiness.
- Implemented baseline saving button in Simulator (`#btnSaveAsBaseline`).
- Updated sidepanel with trial readiness metrics and badges in `ui/sidepanel.html` and `ui/js/sidepanel.js`.
