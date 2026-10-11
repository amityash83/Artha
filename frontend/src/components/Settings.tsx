import React, { useState } from 'react';
import { Archive, Database, Landmark, Palette, SlidersHorizontal, Sparkles, Tags, Upload, Users } from 'lucide-react';
import { BackupsSection, DatabaseSection, ImportSection } from './settings/DataSections';
import { CategoriesSection, InstitutionsSection, PeopleSection, RulesSection } from './settings/PlanningSections';
import { AiSection, AppearanceSection } from './settings/OtherSections';
import type { SectionProps } from './settings/ui';

interface SettingsProps {
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type SectionId = 'database' | 'backups' | 'import' | 'rules' | 'categories' | 'people' | 'institutions' | 'ai' | 'appearance';

const NAV: { heading: string; items: { id: SectionId; label: string; icon: React.ReactNode }[] }[] = [
  { heading: 'Data', items: [
    { id: 'database', label: 'Database', icon: <Database size={15} /> },
    { id: 'backups', label: 'Backups', icon: <Archive size={15} /> },
    { id: 'import', label: 'Import', icon: <Upload size={15} /> },
  ] },
  { heading: 'Planning', items: [
    { id: 'rules', label: 'Planning rules', icon: <SlidersHorizontal size={15} /> },
    { id: 'categories', label: 'Categories', icon: <Tags size={15} /> },
    { id: 'people', label: 'People', icon: <Users size={15} /> },
    { id: 'institutions', label: 'Banks & institutions', icon: <Landmark size={15} /> },
  ] },
  { heading: 'Assistant', items: [{ id: 'ai', label: 'AI assistant', icon: <Sparkles size={15} /> }] },
  { heading: 'Appearance', items: [{ id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> }] },
];

const SECTIONS: Record<SectionId, React.FC<SectionProps>> = {
  database: DatabaseSection,
  backups: BackupsSection,
  import: ImportSection,
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
export const Settings: React.FC<SettingsProps> = ({ onRefresh, showToast }) => {
  const [section, setSection] = useState<SectionId>(initialSection);
  const open = (id: SectionId) => {
    setSection(id);
    try { window.localStorage.setItem(LAST_SECTION_KEY, id); } catch { /* per-device convenience only */ }
  };
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
