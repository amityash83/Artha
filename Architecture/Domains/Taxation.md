# Taxation Domain

## Purpose

Help a salaried user understand and plan their Indian income tax: which regime is cheaper, what each exemption and deduction is worth, how employer NPS changes tax and take-home pay, what TDS to expect each month, and how sensitive all of that is to salary, bonus and pay-mix changes. It is decision support, not tax filing (per `00-Project-Constitution.md`): every result names the rule set it used and how far each rule is verified.

## Scope

- **Tax engine** (`backend/tax/engine.py`): a pure, deterministic 14-step computation for both regimes: gross salary → exemptions → taxable salary → other income → gross total income → deductions → total income (rounded) → slab and special-rate tax → rebate (with marginal relief) → surcharge (tiered, with marginal relief and the 15% cap on special-rate income) → cess → total → prepaid taxes → payable/refund. Every figure carries an audit line: its formula, its source (user input, tax rule, derivation, user-asserted claim) and the rule's verification level and sections.
- **Versioned rule sets**: one JSON file per financial year in `backend/tax/rules/` (`IN-TY2026-27.json` under the Income-tax Act, 2025; `IN-FY2025-26.json` under the 1961 Act). No slab, limit or rate lives in code; a test enforces it.
- **User-editable rule sets** (`backend/tax/rule_store.py`): copy an official set (optionally re-targeted at another year as a draft), edit it, choose which set a year uses. Every save is a new immutable version.
- **Tax Planner UI** (`frontend/src/components/tax/`, the default Taxation tab): Overview KPIs, Salary & CTC (annual or month-by-month), Old and New Regime inputs, Old vs New comparison, Corporate NPS Optimizer, Payslip simulator, Charts A–F, Sensitivity, Computation & Audit, Scenarios, Reports & Export.
- **Month-by-month salary entry**: a 12-month grid (April–March) with actual/projected months, quick fills, spreadsheet paste, CSV import and **payslip PDF import** (`payslip_pdf.py`, `POST /api/tax/payslip-pdf`: read in memory with `pypdf`, never stored; password-protected PDFs supported; finds the pay month and every label/amount pair, which then go through the same editable mapping step as CSV; scanned image-only payslips are reported, not guessed); per-month HRA and a TDS projection. The Payslip tab can then show any single month's own figures instead of the average month.
- **EPF helper** (`epf.py`, `metadata/epf_rules.json`): suggests Employee EPF from basic + DA, either capped at the dated EPFO wage ceiling or on full pay. A month where the ceiling changes (₹15,000 → ₹25,000 from 17 September 2026) is split by calendar days. It only fills the editable EPF input; the engine never derives EPF itself.
- **Corporate NPS optimiser** (`nps.py`), **payslip simulator** (`payroll.py`), **savings waterfall** (`waterfall.py`), **break-even and sensitivity** (`sensitivity.py`): all built by re-running the engine on adjusted inputs, never by per-rupee shortcuts.
- **Fill from my Artha data** (`prefill.py`, `PrefillDialog.tsx`): proposes planner figures from Artha's own records: salary/bonus/interest/dividend income rows, Rent expenses, money put into PPF / ELSS (by fund name) / NPS this year, life/term/health premiums, home and education loan interest and principal (an amortisation estimate from the outstanding balance and the EMIs recorded this year), the rental ledger, realised gains and Profile & Deductions entries. Each item is labelled recorded, estimate or guess. The user ticks items, and ticked items for the same field replace that field. Nothing is written until they apply. Everything, including Income & Expenses entries, is filtered to the chosen person.
- **One plan per person and year**: the planner's "Whose tax" and year pickers each open a saved plan (`tax_planner_drafts`, slot `p<person>-<FY>`), stored in the database so plans travel with the `.db` file. A new year for the same person starts from the current year's figures (month-by-month entries folded into annual totals); a new person starts from the sample payroll. The earlier single draft (slot `default`, or browser storage before that) becomes the Primary Owner's plan for its year, once.
- **Insurance premiums** for 80C/80D come from each policy's premium payment log for the year when recorded; otherwise the current premium for a full year, labelled an estimate.
- **Advance tax** (`advance_tax.py`, Advance Tax tab, `POST /api/tax/advance-tax`): tax not covered by TDS (by default, total tax minus the tax on salary alone, i.e. what an employer deducts; or a TDS figure the user enters), whether it reaches the threshold (resident seniors without business income exempt), each instalment's cumulative amount, dated payments (`inputs.advance_tax_payments`, whose total becomes `prepaid.advance_tax`), shortfalls, deferment interest with the first two instalments' safe harbours, and year-end shortfall interest. All figures come from the rule set's optional `advance_tax` and `return_due_date` items. The Financial Calendar shows upcoming instalments and the return due date from every person's saved plans.
- **Saved scenarios** (`scenario_store.py`): immutable snapshots of inputs, the full result and the exact rule-set version/fingerprint; "recalculate under current rules" writes a new scenario.
- **Reports**: CSV per table or all-in-one, and a printable report saved as PDF (Electron `printToPDF` via the preload bridge; browser print dialog on the web).
- The older **profile estimate** (Profile & Deductions / Old vs New Estimate tabs, `tax_profiles` + `tax_deductions`) now runs on the same engine and rule resolution.
- **Capital gains**: realized gains log (`capital_gains_realizations`) and unrealized estimates from holding lots; special-rate gains (111A/112A/112) are taxed by the engine.
- **Harvesting** (`harvesting.py`, Capital Gains tab, `GET /api/tax/harvesting`): sell-and-rebuy suggestions that use the year's tax-free long-term equity allowance (the rule set's `ltcg_112a_exemption`, net of long-term equity gains already realised), taking each holding's lots oldest first (FIFO) and stopping before a short-term lot; and holdings below cost whose losses would offset this year's taxable gains (short-term losses against short- or long-term gains, long-term against long-term) or carry forward. Read-only suggestions; mutual funds are assumed equity-oriented.

## Out of Scope

- Filing returns, Form 16/26AS/AIS reconciliation, or e-filing integration.
- Business/professional income, presumptive taxation, losses carried forward, clubbing, agricultural income.
- 80G qualifying limits and 50%/100% categories: the user enters the eligible amount.
- The dividend surcharge cap (warned about, not modelled; surcharge on dividends may be slightly overstated).
- Tax on employer-retirement accretions above the ₹7.5L cap (17(2)(viia)).
- Exact payroll TDS schedules: the projection spreads tax still due evenly over remaining months, as most employers do; real payrolls may true-up differently.

## Business Objectives

- Show the cheaper regime and by how much, with every figure explained.
- Quantify employer NPS: tax saved, cash given up, retirement money added, and how that varies by contribution level and funding method.
- Track TDS through the year for variable pay, so the user knows what's still due.
- Expose non-linear effects (surcharge thresholds, rebate cliffs, regime crossovers) through sensitivity analysis rather than rules of thumb.
- Keep tax rules current without code changes, and make the provenance of every rule visible.

## Data Model

- **Engine inputs** (`engine.DEFAULT_INPUTS`): profile (age, residency, employer type, city/metro, TDS regime), salary components (open: unknown keys are taxable cash), optional monthly figures, optional month-by-month section, employer contributions (PF/NPS/superannuation), payroll deductions, HRA rent, exempt allowances, other income, capital gains, deductions, prepaid taxes. Field labels for the UI come from `backend/tax/metadata/input_fields.json`.
- **Rule set**: top-level items (age bands, rounding, cess, aggregate retirement cap, house property, special rates) and per-regime items (slabs, standard deduction, rebate, surcharge, professional tax, HRA, allowance exemptions, house-property loss cap, employer NPS, deductions). Each item is `{value, verification, legacy_section?, act_2025_section?, source?, note?}`. Verification levels: `verified`, `secondary_source`, `unverified`, `assumption`, `user_entered`.
- **Result**: per regime, every computed figure, the audit trail, rates, monthly averages, optional monthly breakdown; plus comparison, warnings and the rule-set reference (id, version, content hash).

## Database Schema

From `backend/db.py`'s `init_db()`:

- `tax_profiles` (person, FY, regime, age band, HRA and other profile fields) and `tax_deductions` (itemised deductions per profile): the older profile estimate.
- `capital_gains_realizations`: realized gains log per Sell transaction.
- `tax_rule_sets`: user rule-set versions (`rule_set_id`, `version`, FY, name, based-on reference, `content_json`, `content_hash`, status, note). `UNIQUE(rule_set_id, version)`.
- `tax_rule_set_selection`: FY → rule set in use (no row = official set).
- `tax_planner_drafts`: the planner's working state (inputs, year, optimisation) per slot, `p<person id>-<FY>`.
- `tax_scenarios`: saved scenarios (name, FY, rule set id/version/hash, `inputs_json`, `result_json`, `recalculated_from`, notes).

The legacy Taxation keys in `financial_rules` (`section_80c_limit`, `standard_deduction_salaried`, …) are still seeded but unused; their descriptions say so.

## Business Rules

All thresholds come from the rule set; the logic is in `backend/tax/`:

- Rebate applies to residents, against slab tax (and 111A tax in the old regime), with new-regime marginal relief just above the limit.
- Surcharge: tiered by total income, capped per regime (25% new), 15% maximum on special-rate income, with marginal relief at each threshold (recomputed at the threshold, not approximated).
- HRA: least of HRA received, rent minus 10% of salary, 50%/40% of salary (metro list per rule set); per month in month-by-month mode.
- Employer NPS: deductible up to the regime's % of basic + DA, within the aggregate PF + NPS + superannuation cap; excess is taxable.
- Employee NPS fills 80CCD(1B) first, then the 80C pool. Payroll EPF/VPF count towards 80C automatically.
- Self-occupied home-loan interest is a house-property loss, capped and only in the old regime.
- Total income and tax are rounded to the nearest ₹10 (flagged as an assumption for the 2025 Act).

## Configuration

- Official rules: `backend/tax/rules/*.json`, bundled into the PyInstaller binary via `--add-data`. See `Tax-Rules-Update-Guide.md` for adding a year.
- User rules: Tax Rules tab (copy, edit, choose per year, import/export JSON, archive).
- Planner defaults (the spec's sample payroll) live in `frontend/src/components/tax/plannerInputs.ts`; they are user data, not rules.

## UI Structure

Taxation page tabs: **Tax Planner** (default), Profile & Deductions, Old vs New Estimate, Capital Gains, **Tax Rules**. Tax Planner sub-tabs: Overview, Salary & CTC, Old Regime, New Regime, Old vs New, NPS Optimizer, Payslip, Charts, Sensitivity, Computation & Audit, Scenarios, Reports & Export. Charts use chart.js with a palette validated for colour-blind separation on the dark surface; every chart has a data-table view. Results computed from older inputs stay visible but dimmed ("Updating…") until fresh ones arrive.

## API Contracts

- `POST /api/tax/compute`: inputs + FY (or explicit rule set) → full result.
- `GET /api/tax/input-metadata`, `GET/POST/PUT/DELETE /api/tax/rule-sets[/{id}]`, `/versions`, `/diff`, `/archive`, `/restore`, `PUT /api/tax/rule-set-selection/{fy}`.
- `GET/POST/DELETE /api/tax/scenarios[/{id}]`, `POST /api/tax/scenarios/{id}/recalculate`.
- `POST /api/tax/nps-scenarios`, `/payslip` (optional `month_index` with month-by-month entry), `/waterfall`, `/sensitivity`, `/nps-target`, `/epf-suggestion`, `/advance-tax`; `GET /api/tax/harvesting?person_id=&financial_year=`.
- `GET /api/tax/prefill?financial_year=&person_id=`: proposals from Artha's records (read-only).
- `GET/PUT/DELETE /api/tax/planner-draft/{slot}`.
- `GET /api/tax-profiles/{id}/estimate`: the profile estimate, on the same engine.

Rule resolution everywhere: explicit rule set → the user's selection for the FY → the official set.

## AI Responsibilities

None in the engine. The AI Assistant (`backend/ai/`) can explain figures already computed; it never computes tax or changes rules.

## Reports

Reports & Export tab: CSV per table (summary, comparison, computation per regime, waterfalls, NPS scenarios, payslip, monthly breakdown, sensitivity tables, checks) or everything in one CSV; and a printable report (same tables plus header, rule-set fingerprint and disclaimer) saved as PDF.

## Future Enhancements

- Confirm `secondary_source`/`unverified` items against the Income-tax Act, 2025, Finance Act 2026 and Income-tax Rules 2026 texts, and upgrade them to `verified`.
- Model the dividend surcharge cap and accretion tax above the retirement cap.
- Form 16 (annual, Part A/B) import; OCR for scanned payslips.
- Take the real home-loan interest from a lender certificate rather than the amortisation estimate.
