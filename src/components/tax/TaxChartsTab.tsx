import React, { useState } from 'react';
import { TaxComputeResult, TaxNpsScenariosResult, TaxPayslipResult, TaxRegimeKey, TaxWaterfallResult } from '../../types';
import type { OptimizationProps } from './NpsOptimizer';
import { npsRequest, payslipRequest, toEngineInputs } from './plannerInputs';
import { EmptyState, ErrorBanner, Freshness, SubTabs } from './taxUi';
import {
  CashFlowChart, NpsScenarioCharts, RegimeTaxChart, SalaryBreakdownChart, TaxRateChart, WaterfallChart,
} from './TaxChartViews';
import { useTaxPost } from './useTaxPost';

export const TaxChartsTab: React.FC<OptimizationProps & { result: TaxComputeResult | null }> = (props) => {
  const { inputs, financialYear, optimization, result } = props;
  const [waterfallRegime, setWaterfallRegime] = useState<TaxRegimeKey>('new');
  const enabled = !!financialYear;
  const engineInputs = toEngineInputs(inputs);
  const wfNew = useTaxPost<TaxWaterfallResult>('/api/tax/waterfall', { financial_year: financialYear, inputs: engineInputs, regime: 'new' }, enabled);
  const wfOld = useTaxPost<TaxWaterfallResult>('/api/tax/waterfall', { financial_year: financialYear, inputs: engineInputs, regime: 'old' }, enabled);
  const nps = useTaxPost<TaxNpsScenariosResult>('/api/tax/nps-scenarios', npsRequest(inputs, financialYear, optimization), enabled);
  const slip = useTaxPost<TaxPayslipResult>('/api/tax/payslip', payslipRequest(inputs, financialYear, optimization), enabled);

  if (!result) return <EmptyState>Computing…</EmptyState>;
  const errors = [wfNew.error, wfOld.error, nps.error, slip.error].filter(Boolean) as string[];
  const waterfalls = { new: wfNew.data ?? undefined, old: wfOld.data ?? undefined };
  const selectedWaterfall = waterfallRegime === 'new' ? wfNew.data : wfOld.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {errors.map((e) => <ErrorBanner key={e} message={e} />)}
      <Freshness stale={wfNew.stale || wfOld.stale}><RegimeTaxChart result={result} waterfalls={waterfalls} /></Freshness>
      <SalaryBreakdownChart inputs={inputs} result={result} />
      <div>
        <SubTabs label="Waterfall regime" active={waterfallRegime} onChange={setWaterfallRegime}
          tabs={[{ key: 'new' as TaxRegimeKey, label: 'New regime waterfall' }, { key: 'old' as TaxRegimeKey, label: 'Old regime waterfall' }]} />
        {selectedWaterfall
          ? <Freshness stale={waterfallRegime === 'new' ? wfNew.stale : wfOld.stale}><WaterfallChart waterfall={selectedWaterfall} /></Freshness>
          : <EmptyState>Building waterfall…</EmptyState>}
      </div>
      {nps.data ? <Freshness stale={nps.stale}><NpsScenarioCharts nps={nps.data} /></Freshness> : <EmptyState>Comparing NPS levels…</EmptyState>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px' }}>
        {slip.data ? <Freshness stale={slip.stale}><CashFlowChart payslip={slip.data} /></Freshness> : <EmptyState>Building payslips…</EmptyState>}
        <TaxRateChart result={result} />
      </div>
    </div>
  );
};
