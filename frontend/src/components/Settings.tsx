import React, { useEffect, useState } from 'react';
import { Archive, Bell, Database, Landmark, Palette, SlidersHorizontal, Sparkles, Tags, Upload, Users } from 'lucide-react';
import { BackupsSection, DatabaseSection, ImportSection } from './settings/DataSections';
import { CategoriesSection, InstitutionsSection, PeopleSection, RulesSection } from './settings/PlanningSections';
import { AiSection, AppearanceSection } from './settings/OtherSections';
import type { SectionProps } from './settings/ui';
import { RemindersSection } from './Reminders';

interface SettingsProps {
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** Open this section (from the top bar or Go-to search); nonce re-triggers the same section. */
  openSection?: { id: string; nonce: number } | null;
}

type SectionId = 'database' | 'backups' | 'import' | 'reminders' | 'rules' | 'categories' | 'people' | 'institutions' | 'ai' | 'appearance';

const NAV: { heading: string; items: { id: SectionId; label: string; icon: React.ReactNode }[] }[] = [
  { heading: 'Data', items: [
    { id: 'database', label: 'Database', icon: <Database size={15} /> },
    { id: 'backups', label: 'Backups', icon: <Archive size={15} /> },
    { id: 'import', label: 'Import', icon: <Upload size={15} /> },
  ] },
  { heading: 'Planning', items: [
    { id: 'rules', label: 'Planning rules', icon: <SlidersHorizontal size={15} /> },
    { id: 'reminders', label: 'Reminders', icon: <Bell size={15} /> },
    { id: 'categories', label: 'Categories', icon: <Tags size={15} /> },
    { id: 'people', label: 'People', icon: <Users size={15} /> },
    { id: 'institutions', label: 'Banks & institutions', icon: <Landmark size={15} /> },
  ] },
  { heading: 'Assistant', items: [{ id: 'ai', label: 'AI assistant', icon: <Sparkles size={15} /> }] },
  { heading: 'Appearance', items: [{ id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> }] },
];

const KEYWORDS: Record<SectionId, string> = {
  database: 'file switch open new',
  backups: 'restore copy automatic',
  import: 'mmex money manager csv',
  reminders: 'notifications due dates bills premiums alerts',
  rules: 'emergency fund thresholds savings rate',
  categories: 'custom fields schema',
  people: 'household owner spouse',
  institutions: 'banks brokers insurers lenders',
  ai: 'assistant ollama openai anthropic claude',
  appearance: 'branding accent colour logo',
};

/** Settings sections for the Go-to search. */
export const SETTINGS_SECTIONS = NAV.flatMap((g) => g.items.map((it) => ({ id: it.id, label: it.label, keywords: KEYWORDS[it.id] })));

const SECTIONS: Record<SectionId, React.FC<SectionProps>> = {
  database: DatabaseSection,
  backups: BackupsSection,
  import: ImportSection,
  reminders: RemindersSection,
  rules: RulesSection,
  categories: CategoriesSection,
  people: PeopleSection,
  institutions: InstitutionsSection,
  ai: AiSection,
  appearance: AppearanceSection,
};

const LAST_SECTION_KEY = 'artha.settings.section';
const initialSection = (): SectionId => {
  try {
    const saved = window.localStorage.getItem(LAST_SECTION_KEY) as SectionId | null;
    return saved && saved in SECTIONS ? saved : 'database';
  } catch {
    return 'database';
  }
};

/**
 * Settings: a section list on the left and, on the right, groups of "label | control"
 * rows (components/settings/ui.tsx). Most changes save as they're made.
 */
export const Settings: React.FC<SettingsProps> = ({ onRefresh, showToast, openSection }) => {
  const [section, setSection] = useState<SectionId>(() => (openSection && openSection.id in SECTIONS ? openSection.id as SectionId : initialSection()));
  const open = (id: SectionId) => {
    setSection(id);
    try { window.localStorage.setItem(LAST_SECTION_KEY, id); } catch { /* per-device convenience only */ }
  };
  useEffect(() => {
    if (openSection && openSection.id in SECTIONS) open(openSection.id as SectionId);
  }, [openSection?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const Section = SECTIONS[section];
  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {NAV.map((g) => (
            <React.Fragment key={g.heading}>
              <div className="settings-nav-heading">{g.heading}</div>
              {g.items.map((it) => (
                <button key={it.id} type="button" className="settings-nav-item" aria-current={section === it.id ? 'page' : undefined} onClick={() => open(it.id)}>
                  {it.icon}{it.label}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <div className="settings-content">
          <Section key={section} onRefresh={onRefresh} showToast={showToast} />
        </div>
      </div>
    </div>
  );
};
