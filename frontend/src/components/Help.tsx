import React, { useState } from 'react';
import {
  Compass, ArrowRightLeft, PiggyBank, LineChart, CreditCard,
  ShieldCheck, Home, Target, Percent, Database, CalendarClock, AlertTriangle
} from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  body: React.ReactNode;
}

const H4: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{children}</h4>
);

const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ol>
);

const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    display: 'flex', gap: '10px', alignItems: 'flex-start',
    background: 'var(--warning-bg)', border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: '13px',
  }}>
    <AlertTriangle size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
    <div>{children}</div>
  </div>
);

const SECTIONS: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: <Compass size={16} />,
    body: (
      <>
        <p>
          Artha is a privacy-first, offline-first personal finance app. Everything lives in a local database file on
          your own computer — there's no mandatory account, no cloud sync, and no data leaves your machine unless you
          explicitly export it. Think of Artha less like a bank app and more like a financial command center: it
          doesn't move your money, it helps you track, understand, and plan around it.
        </p>
        <p>The sidebar is organized into four groups, top to bottom:</p>
        <Bullets items={[
          <><strong>Day to day</strong> — Dashboard (record each month's balances from its net worth chart), Income &amp; Expenses, Cash Flow Planning, Transactions Ledger, Budget Planner, Financial Calendar</>,
          <><strong>What you own &amp; owe</strong> — Accounts, Assets, Liabilities, Credit Cards, Goals</>,
          <><strong>Planning</strong> — Simulations, Loan planner (EMI and prepayments, and which loan to pay first), Taxation, Ask Artha, Reports</>,
          <><strong>App</strong> — Settings, Help</>,
        ]} />
        <p>The core mental model to understand before anything else:</p>
        <Steps items={[
          <><strong>Accounts</strong> are your bank/wallet balances — but Artha never stores a balance directly. It's always calculated from your transaction history.</>,
          <><strong>Assets</strong> are what you own with value — investments, property, insurance policies, and so on.</>,
          <><strong>Liabilities</strong> are what you owe — loans and credit cards.</>,
          <><strong>Transactions</strong> are the ledger that connects everything. Every rupee that moves is recorded as a transaction between two "sides" (an account, an asset, a liability, or "external" money entering/leaving the system).</>,
        ]} />
        <p>Once you're comfortable with "balances come from transactions, not the other way around," most of the rest of the app follows naturally.</p>
      </>
    ),
  },
  {
    id: 'accounts-transactions',
    title: 'Accounts & Transactions',
    icon: <ArrowRightLeft size={16} />,
    body: (
      <>
        <H4>Accounts have no stored balance</H4>
        <p>
          This is the single most important thing to understand about Artha. When you look at an account's balance
          anywhere in the app, it is being calculated in real time by adding up every transaction that flows into
          that account and subtracting every transaction that flows out of it. There is no "balance" field sitting
          in a database row waiting to be edited.
        </p>
        <Note>
          You cannot fix a wrong balance by editing the account. If a balance looks wrong, the fix always lives in
          the Transactions Ledger — either edit the transaction that's wrong, or add a missing one.
        </Note>

        <H4>Setting up a new account</H4>
        <Steps items={[
          <>Go to <strong>Accounts</strong> and click <strong>Add Entity</strong>.</>,
          <>Fill in the name, institution, owner, currency, and status.</>,
          <>Only when creating a brand-new account, you'll also see an <strong>Opening Balance</strong> field. Enter your current real-world balance here.</>,
          <>On save, Artha creates a one-off transaction dated today, labeled "Initial balance registration," that credits your account with that amount. From that point forward, your balance is just the running total of all transactions.</>,
        ]} />
        <p>A couple of things to know about opening balance:</p>
        <Bullets items={[
          <>It <strong>only appears when creating</strong> an account — once the account exists, editing it will never show this field again, because changing it wouldn't do anything (the balance is already derived from transactions, not from this field).</>,
          <>If you enter <strong>₹0</strong> as the opening balance, no transaction is created at all — there's simply nothing to record.</>,
          <>If you got the opening balance wrong, don't try to re-edit the account. Instead, find the "Initial balance registration" entry in the Transactions Ledger and correct the amount there, or add a new adjusting transaction.</>,
        ]} />

        <H4>Adding, editing, and deleting transactions</H4>
        <p>The Transactions Ledger is where you log every movement of money. When you log a transaction, you choose a <strong>type</strong>, which determines what you're asked for next:</p>
        <Bullets items={[
          <><strong>Debit</strong> — money leaving an account for an expense category</>,
          <><strong>Credit</strong> — money arriving in an account from an income category</>,
          <><strong>Transfer</strong> — money moving between two of your own accounts</>,
          <><strong>Investment (Buy)</strong> — money leaving an account to fund an asset (e.g. buying a stock or topping up an investment)</>,
          <><strong>Redemption (Sell)</strong> — money coming back into an account from selling/redeeming an asset</>,
          <><strong>EMI</strong> — a loan payment that reduces a liability's outstanding balance</>,
          <><strong>Prepayment</strong> — an extra loan payment that also reduces a liability's outstanding balance</>,
        ]} />
        <p>How to log a transaction:</p>
        <Steps items={[
          <>Go to <strong>Transactions Ledger</strong> and click <strong>Log Transaction</strong>.</>,
          <>Choose the type — the form will change to ask for the right counterpart (a destination account for a Transfer, an asset for Investment/Redemption, a liability for EMI/Prepayment, or a category for Debit/Credit).</>,
          <>Pick the primary account, enter the amount, date, and optional notes.</>,
          <>Save. Artha immediately updates the relevant balances behind the scenes.</>,
        ]} />
        <p>
          <strong>Editing or deleting is not a simple overwrite.</strong> When you edit a transaction, Artha first
          fully undoes the old transaction's effect on balances, then applies the new version fresh — so if you
          change a ₹5,000 EMI to ₹6,000, it isn't a ₹1,000 adjustment, it's "put back the ₹5,000, then take out
          ₹6,000." Deleting works the same way. In practice you don't need to think about this mechanically — just
          know that edits and deletes always leave your balances in a correct final state.
        </p>
        <p>
          A note on transfers, investments, EMIs and prepayments: these move value between two "sides" (for example,
          Account → Asset for a Buy, or Account → Liability for an EMI). Only the sides that are actually accounts,
          assets, or liabilities get adjusted — a Debit/Credit against a budget category doesn't touch any asset or
          liability, only the account.
        </p>
        <Note>
          Artha does not currently stop you from recording a transaction that would push an account's calculated
          balance negative. There's no "insufficient funds" warning — if you log more Debits than you have Credits,
          the balance will simply show as negative. Keep this in mind when double-checking entries.
        </Note>
      </>
    ),
  },
  {
    id: 'assets-liabilities',
    title: 'Assets & Liabilities',
    icon: <PiggyBank size={16} />,
    body: (
      <>
        <p>
          Assets (what you own) and Liabilities (what you owe) both work through the same generic screen: a
          filterable table by <strong>Category</strong>, with Add Entity, edit, and delete actions.
        </p>

        <H4>Adding or editing an asset or liability</H4>
        <Steps items={[
          <>Go to <strong>Assets</strong> or <strong>Liabilities</strong> and click <strong>Add Entity</strong> (or the edit icon on an existing row).</>,
          <>Pick a <strong>Category</strong> — this determines which extra fields appear. Categories are things like Stock, Mutual Fund, Insurance, Property, Home Loan, Personal Loan, Credit Card, or any custom category you've created in Settings.</>,
          <>Fill in the standard fields (name, institution, owner, current value/outstanding, status) plus whatever category-specific fields appear.</>,
          <>Save.</>,
        ]} />
        <p>Deleting an entity asks for a confirmation click before it actually removes the row.</p>

        <H4>What "Current Value" means, per category</H4>
        <p>
          "Current Value" (for assets) is a plain number you maintain yourself — Artha doesn't fetch live market
          prices. What it means varies by category:
        </p>
        <Bullets items={[
          <>For most assets, it's simply what the asset is worth today, as you understand it.</>,
          <>For <strong>Stocks and Mutual Funds</strong>, current value/quantity/cost are computed from your recorded purchase lots (see Investments) rather than being something you type in directly.</>,
          <>For <strong>Insurance</strong>, current value is a separate, independently-tracked field from the policy's coverage amount (see Insurance) — for many policies (especially Term life) it's legitimately zero.</>,
        ]} />
        <Note>
          If you delete an asset or liability that has additional linked records (purchase lots on a stock,
          claims/premium history on an insurance policy, or configuration on a credit card), those linked records are
          not currently guaranteed to be cleaned up automatically. This is mostly invisible day-to-day, but it means
          deleting and recreating an entity isn't a perfectly clean reset — if you need a true fresh start, it's
          safer to edit the existing entity rather than delete and re-add it.
        </Note>
      </>
    ),
  },
  {
    id: 'investments',
    title: 'Investments',
    icon: <LineChart size={16} />,
    body: (
      <>
        <p>
          Stocks and Mutual Funds are handled differently from other assets: instead of one editable quantity and
          cost price, you record individual <strong>purchase lots</strong> — one row per time you bought in, with
          its date, quantity, and price per unit.
        </p>

        <H4>Why lots instead of one quantity field</H4>
        <p>
          Buying more of the same stock at different prices and dates is how real portfolios work, and it's what
          makes an accurate return calculation possible. Artha computes your total quantity, your average cost per
          unit, and your <strong>XIRR</strong> (annualized return, accounting for the timing and size of each
          purchase) directly from your recorded lots — these are never something you type in by hand.
        </p>

        <H4>How to record a purchase or sale</H4>
        <Steps items={[
          <>Open the asset (or create a new Stock/Mutual Fund asset) and find the <strong>Purchase Lots</strong> section.</>,
          <>Click <strong>Add Lot</strong>, and fill in the purchase date, quantity, and price per unit for that specific buy.</>,
          <>Save the asset — your total quantity, average cost, and XIRR update immediately.</>,
          <>To sell, log a <strong>Redemption</strong> transaction in the Transactions Ledger against this asset.</>,
        ]} />
        <Note>
          A sale is currently modeled as a full exit — selling consumes your recorded lots to calculate the realized
          gain, so partial sales aren't separately tracked lot-by-lot. Treat a Redemption as "I sold my position in
          this holding," not a partial trim.
        </Note>
        <p>Editing or removing a lot immediately recalculates quantity, cost, and XIRR — there's no separate "recalculate" step to remember.</p>
      </>
    ),
  },
  {
    id: 'credit-cards',
    title: 'Credit Cards',
    icon: <CreditCard size={16} />,
    body: (
      <>
        <p>
          This is the one area of Artha where it's easy to get confused, because there are genuinely{' '}
          <strong>two separate places</strong> to manage a credit card, and they do not share data.
        </p>
        <Bullets items={[
          <>
            <strong>The generic Liabilities screen</strong> (Liabilities → Category: Credit Card). Editing a card
            here saves basic fields like credit limit, statement date, and due date into what you can think of as
            the card's "official record." <strong>This is the only place the Financial Calendar reads from</strong>{' '}
            for due-date reminders.
          </>,
          <>
            <strong>The dedicated Credit Cards screen</strong> in the sidebar. This is a much richer tool with
            reward-point simulation, category spending multipliers, milestone/fee-waiver tracking, lounge visit
            counters, and a card comparison library. Saving changes here writes to a separate configuration store
            attached to the card.
          </>,
        ]} />
        <Note>
          <strong>The gotcha:</strong> if you only ever use the dedicated Credit Cards screen to manage a card, its
          due date and statement date never make it into the record the Financial Calendar checks. You can fully
          configure a card's rewards engine there and still never get a "payment due" reminder, because the reminder
          logic doesn't look at that data at all. Conversely, editing basic fields on the generic Liabilities screen
          won't touch or reset any of your reward configuration.
        </Note>
        <H4>Practical guidance</H4>
        <Bullets items={[
          <>Use the <strong>dedicated Credit Cards screen</strong> for reward optimization, comparing cards, tracking milestones, and lounge visits.</>,
          <>Also visit the <strong>generic Liabilities screen</strong> (or set the due date when registering the card there) at least once so the Financial Calendar can remind you before your bill is due.</>,
          <>If a due-date reminder looks wrong or missing, check the card's entry under Liabilities, not just the Credit Cards screen — that's the source of truth for the reminder.</>,
          <>Registering/saving a card through the dedicated Credit Cards screen also resets certain loan-style fields (interest rate, EMI, tenure) on the underlying record to zero/none — this is expected and keeps a credit card from being mistaken for a loan elsewhere in the app.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'insurance',
    title: 'Insurance',
    icon: <ShieldCheck size={16} />,
    body: (
      <>
        <p>
          Insurance assets carry a <strong>Policy Type</strong> — Life, Term, Health, or Vehicle — which determines
          which coverage fields you'll see (sum assured and surrender value for Life; sum assured for Term; sum
          insured and claims tracking for Health; insured declared value and registration number for Vehicle).
        </p>

        <H4>Current Value vs. coverage amount — two different numbers</H4>
        <p>
          "Current Value" (on the main asset record) and the policy's coverage figure (sum assured / sum insured /
          IDV, depending on type) measure different things, and the Assets grid shows them as separate columns
          (Current Value and Cover).
        </p>
        <Bullets items={[
          <><strong>Current Value</strong> is the policy's cash/surrender value today — what the insurer would pay you to exit. Saving a policy's <strong>Surrender Value</strong> field automatically sets Current Value, so it flows into net worth, asset allocation, and any linked goal's progress. For a Term policy this is legitimately <strong>₹0</strong>, since a pure Term plan has no cash value to redeem.</>,
          <><strong>Cover (Sum Assured / Sum Insured / IDV)</strong> is the protection amount — what would be paid out on a claim. It is never counted in net worth.</>,
          <><strong>Premiums Paid</strong> is your cost basis — the sum of payments logged in Premium Payment History (or the Invested Amount field if no payments are logged yet).</>,
        ]} />
        <Note>Don't be alarmed if Current Value shows ₹0 on a Term policy — that's expected, not a bug.</Note>

        <H4>How to find your surrender value</H4>
        <p>
          Only traditional/endowment life policies acquire a surrender value (usually after 2–3 full years of
          premiums). Term, Health, and Vehicle policies have none — leave theirs at ₹0.
        </p>
        <Bullets items={[
          <><strong>LIC</strong>: log in to the LIC customer portal (licindia.in) → Policy Status, which shows surrender value for most policies — or ask any LIC branch for a surrender-value quote with your policy number.</>,
          <><strong>Private insurers (HDFC Life, Bajaj Allianz, etc.)</strong>: the insurer's app or customer portal usually shows it under policy details; otherwise request a quote via their helpline.</>,
          <>Insurers may quote two figures: the <strong>Guaranteed Surrender Value</strong> (a formula percentage of premiums paid) and the <strong>Special Surrender Value</strong> (usually higher, based on paid-up value and accrued bonuses). Enter the special/actual quote — that's what they would really pay.</>,
        ]} />
        <p>
          Surrender values change with each premium paid and bonus declaration — refreshing them once or twice a
          year (say, at policy anniversary) is plenty. Enter it via Assets → Insurance → edit the policy →
          Surrender Value → Save.
        </p>

        <H4>Claims and premium history</H4>
        <p>Each insurance asset has two optional history logs you can maintain:</p>
        <Bullets items={[
          <><strong>Adding a claim</strong>: open the policy, find Claims History, click Add Claim, and record the date, amount, status (Filed/Approved/Rejected/Settled), and a short description.</>,
          <><strong>Recording a premium payment</strong>: open the policy, find Premium Payment History, click Add Payment, and record the date, amount, and any notes. Logged payments add up into the Premiums Paid column on the Assets grid.</>,
        ]} />
        <p>
          The claims log is an informational record — it doesn't automatically update the policy's
          claims-made/claims-amount summary fields, so if you track both, keep them consistent yourself.
        </p>
      </>
    ),
  },
  {
    id: 'properties',
    title: 'Properties',
    icon: <Home size={16} />,
    body: (
      <>
        <p>
          Property assets support a month-by-month <strong>Rental Ledger</strong> so you can track rent collected
          and expenses incurred over time, separate from the property's overall value.
        </p>
        <H4>How to log rental activity</H4>
        <Steps items={[
          <>Open the property asset and find the Rental Ledger section.</>,
          <>Click <strong>Add Month</strong>, pick the month, and enter rent received and expenses for that month, with optional notes.</>,
          <>Save — Artha shows you the average monthly rent and net cash flow across everything you've logged.</>,
        ]} />
        <Note>
          The "Rental Income" figure shown in the Properties list (and used in Cash Flow Planning) is a separate
          field you set directly on the property — it is not automatically calculated from your month-by-month
          ledger entries. If you keep both, update them together so they stay consistent; the ledger is a detailed
          history, while the summary field is what other parts of the app (like cash flow projections) actually read.
        </Note>
        <p>
          A property can also be linked to its Home Loan — set this from the property's own edit form (a "Linked
          Home Loan" field), which is the one place this connection is managed.
        </p>
      </>
    ),
  },
  {
    id: 'goals',
    title: 'Goals',
    icon: <Target size={16} />,
    body: (
      <>
        <p>Goals track progress toward a savings target — a house down payment, retirement, an emergency fund, and so on.</p>

        <H4>How goal progress is actually computed</H4>
        <p>
          A goal's <strong>Current Amount</strong> is not something you type in directly — even though the field
          appears editable on the form, whatever value you enter there gets <strong>overridden</strong> by Artha
          every time the Goals screen loads. The real progress figure is calculated by adding up the current value
          of every asset you've explicitly linked to that goal.
        </p>
        <Note>
          <strong>The right way to fund a goal:</strong> rather than typing in a current amount, link real assets to
          it. When editing an asset (in Assets), use its <strong>Linked Financial Goal</strong> field to associate it
          with a goal. Once linked, that asset's value counts toward the goal's progress automatically, and updates
          as the asset's value changes — no manual syncing needed.
        </Note>
        <p>
          If a goal shows 0% progress despite you "having the money," it almost always means no asset has been
          linked to it yet.
        </p>

        <H4>Funding restrictions</H4>
        <p>
          When creating or editing a goal, you can mark certain asset categories as excluded from funding it (for
          example, "don't let my Emergency Fund goal count Stocks"). This is a guardrail to catch cases where the
          wrong kind of asset ends up counted toward a goal it shouldn't be — Artha will flag a violation if a
          linked asset falls into an excluded category.
        </p>
      </>
    ),
  },
  {
    id: 'taxation',
    title: 'Taxation',
    icon: <Percent size={16} />,
    body: (
      <>
        <p>
          Taxation is organized <strong>per person, per financial year</strong> — pick a person and a financial year
          at the top of the screen, then work through three tabs: Profile &amp; Deductions, Old vs New Estimate, and
          Capital Gains.
        </p>

        <H4>What it estimates</H4>
        <Steps items={[
          <>
            <strong>Profile &amp; Deductions</strong>: enter your regime preference, age band, HRA details (basic
            salary, HRA received, rent paid, metro/non-metro), home loan interest (self-occupied), other taxable
            income, and TDS/advance tax already paid. Add itemized deductions (80C, 80D, and others) in the
            deductions list.
          </>,
          <>
            <strong>Old vs New Estimate</strong>: computes and compares tax payable under both regimes side by side,
            factoring in the standard deduction, capped Section 80C/80D deductions, HRA exemption, and an unrealized
            capital gains estimate on your Stock/Mutual Fund/Property holdings — then recommends whichever regime
            results in lower tax, and estimates a refund or amount due against what you've already paid.
          </>,
          <>
            <strong>Capital Gains</strong>: shows a log of gains that were actually <strong>realized</strong> — this
            list only grows when you record an actual Sell transaction against a Stock, Mutual Fund, or Property
            asset. This differs from the unrealized estimate on the Estimate tab, which treats your current holding
            values as if you sold everything today, purely for planning purposes.
          </>,
        ]} />

        <H4>Important caveats</H4>
        <Bullets items={[
          <><strong>This is an estimate only</strong> — not tax advice and not filing-ready. There's no e-filing, no ITR generation, and no export for a tax filer. Always verify against the current year's actual Finance Act before making real filing decisions.</>,
          <>The tax slab rates, cess, and rebate thresholds used are current best-effort figures, not a full multi-year history — selecting an older or future financial year does not change which slab rates are applied.</>,
          <>There's currently no surcharge calculation for high income levels — only the base slab tax and health &amp; education cess are computed.</>,
          <>If you track more than one person's income in the same household database, the "gross income" used in each person's estimate is pulled from all taxable income entries in the whole database, not filtered to that specific person — a multi-person household should double check this figure rather than assume it's automatically scoped correctly.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'master-data',
    title: 'Master Data',
    icon: <Database size={16} />,
    body: (
      <>
        <p>
          Categories, Institutions, and People are the shared building blocks used across every other screen —
          they're managed in one place: <strong>Settings</strong>, not on the Accounts/Assets/Liabilities screens
          themselves.
        </p>
        <Bullets items={[
          <><strong>Categories</strong> define the type of an asset, liability, income, or expense (Stock, Mutual Fund, Home Loan, Credit Card, etc.), and can carry custom extra fields you define yourself. Go to Settings → Category Schema Builder to add a category or add custom fields to an existing one.</>,
          <><strong>Institutions</strong> are the banks, brokers, or lenders tied to your accounts, assets, and liabilities. Add or rename them under the same Settings area.</>,
          <><strong>People</strong> represent owners of accounts/assets/liabilities — useful for households tracking more than one person's finances together, and required for Taxation profiles.</>,
        ]} />
        <H4>How to add master data</H4>
        <Steps items={[
          <>Go to <strong>Settings</strong>.</>,
          <>For a new category: switch to the Category Schema Builder tab, give it a name, choose which entity type it applies to (Asset/Liability/Income/Expense), optionally add custom fields, and save.</>,
          <>For a new institution or person: use the inline add form in the same tab.</>,
        ]} />
        <p>
          These all support inline rename and delete — but deleting a category, institution, or person that's still
          referenced by existing entities will typically be blocked until you reassign or remove those references
          first.
        </p>
      </>
    ),
  },
  {
    id: 'calendar-recommendations',
    title: 'Financial Calendar & Recommendations',
    icon: <CalendarClock size={16} />,
    body: (
      <>
        <p>
          <strong>Financial Calendar</strong> projects a 12-month forward view of recurring money events: loan EMI
          due dates, goal contribution (SIP) reminders, insurance premium due dates, and credit card payment due
          dates. As covered under Credit Cards, credit card due dates only populate correctly if the card's due date
          was set via the generic Liabilities screen (or at registration) — not solely through the dedicated Credit
          Cards screen.
        </p>
        <p>
          <strong>Dashboard recommendations</strong> are Artha's built-in financial coaching — a set of automatically
          generated cards that flag things worth your attention: an emergency fund shortfall, an insurance reserve
          gap, high-interest debt that might be worth prepaying (compared against your available surplus liquidity),
          and any goal being funded by an asset category you've explicitly excluded for it. Each recommendation is
          colored by urgency, and some offer an "Optimize Now" shortcut into the Simulations tool to model the
          suggested action before you commit to it.
        </p>
        <p>
          These recommendations are based on rules you can tune yourself in <strong>Settings → Rules Engine</strong>{' '}
          (things like your target emergency fund size or the interest rate threshold considered "high") — if a
          recommendation seems off, check whether the underlying rule matches your actual situation.
        </p>
      </>
    ),
  },
];

export const Help: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  const active = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Help</h1>
        <p className="page-subtitle">How to use Artha: adding and correcting data, and how each screen works.</p>
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        <nav
          aria-label="Help topics"
          className="glass-panel"
          style={{ width: '260px', flexShrink: 0, padding: '12px', position: 'sticky', top: '24px' }}
        >
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  className={`sidebar-item ${activeSection === s.id ? 'active' : ''}`}
                  style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: activeSection === s.id ? undefined : 'transparent' }}
                  aria-current={activeSection === s.id ? 'page' : undefined}
                  onClick={() => setActiveSection(s.id)}
                >
                  {s.icon}
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="glass-panel" style={{ flex: 1, padding: '28px', minWidth: 0 }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {active.icon}
            {active.title}
          </h2>
          <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {active.body}
          </div>
        </div>
      </div>
    </div>
  );
};
