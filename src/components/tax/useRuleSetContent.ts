import { useEffect, useState } from 'react';
import { TaxRuleItem, TaxRuleSetContent, TaxRuleSetMeta } from '../../types';
import { apiJson } from './taxUi';

const cache = new Map<string, TaxRuleSetContent>();

/** Content of one rule set version (immutable, so cached per id+version). */
export function useRuleSetContent(ruleSetId?: string, version?: number): TaxRuleSetContent | null {
  const key = ruleSetId && version ? `${ruleSetId}@${version}` : '';
  const [content, setContent] = useState<TaxRuleSetContent | null>(key ? cache.get(key) ?? null : null);

  useEffect(() => {
    if (!key) {
      setContent(null);
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setContent(cached);
      return;
    }
    let cancelled = false;
    apiJson<{ meta: TaxRuleSetMeta; content: TaxRuleSetContent }>(`/api/tax/rule-sets/${encodeURIComponent(ruleSetId!)}?version=${version}`)
      .then((r) => {
        cache.set(key, r.content);
        if (!cancelled) setContent(r.content);
      })
      .catch(() => { if (!cancelled) setContent(null); });
    return () => { cancelled = true; };
  }, [key, ruleSetId, version]);

  return content;
}

export function regimeItem(content: TaxRuleSetContent | null, regime: 'old' | 'new', key: string): TaxRuleItem | null {
  const item = content?.regimes?.[regime]?.[key];
  return item && typeof item === 'object' ? (item as TaxRuleItem) : null;
}

export function sectionLabel(item: TaxRuleItem | null): string {
  if (!item) return '';
  const parts = [item.legacy_section && `s.${item.legacy_section}`, item.act_2025_section && `2025 Act: ${item.act_2025_section}`];
  return parts.filter(Boolean).join(' · ');
}
