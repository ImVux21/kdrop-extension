# 04-shared-economics-and-unit-costs

Status: closed
Labels: core, financial, economics

Blocked by: 02

## Description
Update `feeCalculator.js` to compute a comprehensive shared financial result: target selling price, CNY/KRW exchange rate, supplier cost, buying-agent fees, platform commission, shipping basis (quoted or weight/dimensions estimate), advertising cost, return/loss allowance, and other per-order costs. Differentiate missing values from explicit zero, reject invalid inputs, and support distinct baseline vs temporary scenario calculations.

## Acceptance Criteria
- [x] Financial inputs accept explicit zero for advertising and return allowance without falling back to hidden non-zero defaults.
- [x] Missing required costs keep calculation marked as incomplete / provisional.
- [x] Negative costs, non-finite numbers, and invalid rates are rejected with clear validation errors.
- [x] Heavy / bulky items use saved shipping basis or explicit weight rather than hardcoded 300g.
- [x] Buying-per-order fulfillment has no Rocket warehousing cost unless explicitly selected.
- [x] Target max sourcing cost (CNY) uses consistent formulas with exchange rate and target margin.

## Comments
- Refactored `core/feeCalculator.js` with `validateFinancialInputs`, weight/dimensions shipping calculation, explicit 0 vs missing distinction, and scenario assumption modeling.
- Verified in `tests/economics.test.js`.
