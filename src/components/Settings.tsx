import React, { useState, useEffect } from 'react';
import { Upload, Database, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { InfoTooltip } from './InfoTooltip';
import { KnowledgeArticle } from '../types';

interface SettingsProps {
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const Settings: React.FC<SettingsProps> = ({ onRefresh, showToast }) => {
  const [backupsList, setBackupsList] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  // Database Configuration State
  const [dbSettings, setDbSettings] = useState<{
    active_path: string;
    default_path: string;
    recent_databases: string[];
    backup_on_open?: boolean;
    backup_on_close?: boolean;
    backup_count_limit?: number;
    custom_backup_dir?: string;
  } | null>(null);

  // MMEx-Style backup options state
  const [backupOnOpen, setBackupOnOpen] = useState(true);
  const [backupOnClose, setBackupOnClose] = useState(true);
  const [backupCountLimit, setBackupCountLimit] = useState(10);
  const [customBackupDir, setCustomBackupDir] = useState('');
  const [saveSettingsStatus, setSaveSettingsStatus] = useState<string | null>(null);

  // Rules, Categories, Institutions, People metadata states
  const [rules, setRules] = useState<any[]>([]);
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);

  // AI Assistant configuration state
  const [aiProvider, setAiProvider] = useState<'none' | 'ollama' | 'openai' | 'anthropic'>('none');
  const [aiEndpoint, setAiEndpoint] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiApiKeySet, setAiApiKeySet] = useState(false);
  const [aiModel, setAiModel] = useState('');
  const [aiMaxTokens, setAiMaxTokens] = useState(500);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);

  // Form states for creating custom metadata
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('Asset');
  const [newInstName, setNewInstName] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonRole, setNewPersonRole] = useState('Primary Owner');
  const [newPersonRiskTolerance, setNewPersonRiskTolerance] = useState('Moderate');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingInstId, setEditingInstId] = useState<number | null>(null);
  const [editingInstName, setEditingInstName] = useState<string>('');
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);
  const [editingPersonName, setEditingPersonName] = useState<string>('');
  const [editingPersonRole, setEditingPersonRole] = useState<string>('Primary Owner');
  const [editingPersonRiskTolerance, setEditingPersonRiskTolerance] = useState<string>('Moderate');
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);
  const [deletingInstId, setDeletingInstId] = useState<number | null>(null);
  const [deletingPersonId, setDeletingPersonId] = useState<number | null>(null);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<Array<{ name: string; label: string; type: 'text' | 'number' | 'date' }>>([]);

  const [ruleSaveStatus, setRuleSaveStatus] = useState<Record<string, string>>({});
  const [metaStatus, setMetaStatus] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'database' | 'rules' | 'categories' | 'import' | 'ai'>('database');

  useEffect(() => {
    fetchBackups();
    fetchDatabaseSettings();
    fetchRulesList();
    fetchCategoriesList();
    fetchInstitutionsList();
    fetchPeopleList();
    fetch(`${API_BASE_URL}/api/knowledge-articles`)
      .then((res) => res.json())
      .then(setKnowledgeArticles)
      .catch(() => setKnowledgeArticles([]));
    fetch(`${API_BASE_URL}/api/ai/settings`)
      .then((res) => res.json())
      .then((s) => {
        setAiProvider(s.provider || 'none');
        setAiEndpoint(s.endpoint || '');
        setAiModel(s.model || '');
        setAiMaxTokens(s.max_tokens || 500);
        setAiApiKeySet(!!s.api_key_set);
      })
      .catch(() => {});
  }, []);

  const handleSaveAiSettings = async () => {
    setAiStatus('Saving...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          endpoint: aiEndpoint,
          api_key: aiApiKey, // blank means "leave unchanged" server-side
          model: aiModel,
          max_tokens: aiMaxTokens,
        }),
      });
      if (res.ok) {
        setAiStatus('AI settings saved.');
        if (aiApiKey) {
          setAiApiKeySet(true);
          setAiApiKey('');
        }
        onRefresh();
      } else {
        setAiStatus('Failed to save AI settings.');
      }
    } catch (err) {
      console.error(err);
      setAiStatus('Error saving AI settings.');
    } finally {
      setTimeout(() => setAiStatus(null), 3000);
    }
  };

  const handleTestAiConnection = async () => {
    setAiTesting(true);
    setAiStatus('Testing connection...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/test`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        setAiStatus(`Connected — model replied: "${json.reply}"`);
      } else {
        setAiStatus(`Connection failed: ${json.detail || 'unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      setAiStatus('Connection failed — could not reach the backend.');
    } finally {
      setAiTesting(false);
    }
  };

  const fetchRulesList = () => {
    fetch(`${API_BASE_URL}/api/metadata/financial_rules`)
      .then(res => res.json())
      .then(data => setRules(data))
      .catch(err => console.error(err));
  };

  const fetchCategoriesList = () => {
    fetch(`${API_BASE_URL}/api/metadata/categories`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(err => console.error(err));
  };

  const fetchInstitutionsList = () => {
    fetch(`${API_BASE_URL}/api/metadata/institutions`)
      .then(res => res.json())
      .then(data => {
        const sorted = Array.isArray(data) ? [...data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) : data;
        setInstitutions(sorted);
      })
      .catch(err => console.error(err));
  };

  const fetchPeopleList = () => {
    fetch(`${API_BASE_URL}/api/metadata/people`)
      .then(res => res.json())
      .then(data => {
        const sorted = Array.isArray(data) ? [...data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) : data;
        setPeople(sorted);
      })
      .catch(err => console.error(err));
  };

  const handleUpdateRule = async (ruleKey: string, value: number, isEnabled: boolean) => {
    try {
      setRuleSaveStatus(prev => ({ ...prev, [ruleKey]: 'Saving...' }));
      const res = await fetch(`${API_BASE_URL}/api/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_key: ruleKey,
          value,
          is_enabled: isEnabled
        })
      });
      if (res.ok) {
        setRuleSaveStatus(prev => ({ ...prev, [ruleKey]: 'Saved!' }));
        fetchRulesList();
        onRefresh();
        setTimeout(() => {
          setRuleSaveStatus(prev => {
            const next = { ...prev };
            delete next[ruleKey];
            return next;
          });
        }, 2000);
      } else {
        setRuleSaveStatus(prev => ({ ...prev, [ruleKey]: 'Failed' }));
      }
    } catch (err) {
      console.error(err);
      setRuleSaveStatus(prev => ({ ...prev, [ruleKey]: 'Error' }));
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;
    try {
      const isEdit = editingCategoryId !== null;
      setMetaStatus(isEdit ? "Updating Category..." : "Adding Category...");

      const cleanedFields = customFields
        .filter(f => f.name.trim() !== '')
        .map(f => ({
          name: f.name.trim(),
          label: f.label.trim() || f.name.trim(),
          type: f.type || 'text'
        }));

      const payload = {
        entity_type: newCatType,
        name: newCatName.trim(),
        fields_definition: cleanedFields.length > 0 ? JSON.stringify(cleanedFields) : null
      };

      const url = isEdit
        ? `${API_BASE_URL}/api/metadata/categories/${editingCategoryId}`
        : `${API_BASE_URL}/api/metadata/categories`;

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setMetaStatus(isEdit ? "Category updated successfully!" : "Category added successfully!");
        resetCategoryForm();
        fetchCategoriesList();
        onRefresh();
        setTimeout(() => setMetaStatus(null), 3000);
      } else {
        const err = await res.json();
        setMetaStatus(`Failed to save category: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      setMetaStatus("Error saving category");
    }
  };

  const handleAddInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstName) return;
    try {
      setMetaStatus("Adding Institution...");
      const res = await fetch(`${API_BASE_URL}/api/metadata/institutions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newInstName })
      });
      if (res.ok) {
        setMetaStatus("Institution added successfully!");
        setNewInstName('');
        fetchInstitutionsList();
        onRefresh();
        setTimeout(() => setMetaStatus(null), 3000);
      } else {
        setMetaStatus("Failed to add institution");
      }
    } catch (err) {
      console.error(err);
      setMetaStatus("Error adding institution");
    }
  };

  const handleDeleteMetadata = async (type: 'categories' | 'institutions' | 'people', id: number) => {
    try {
      setMetaStatus("Deleting metadata item...");
      const res = await fetch(`${API_BASE_URL}/api/metadata/${type}/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setMetaStatus("Metadata item deleted successfully.");
        setDeletingCategoryId(null);
        setDeletingInstId(null);
        setDeletingPersonId(null);
        if (type === 'categories') fetchCategoriesList();
        else if (type === 'institutions') fetchInstitutionsList();
        else fetchPeopleList();
        onRefresh();
        setTimeout(() => setMetaStatus(null), 3000);
      } else {
        setMetaStatus("Failed to delete metadata item. Check if linked to active accounts/assets.");
      }
    } catch (err) {
      console.error(err);
      setMetaStatus("Error deleting metadata item");
    }
  };

  const handleEditMetadata = async (type: 'categories' | 'institutions', id: number, currentName: string) => {
    if (type === 'categories') {
      const cat = categories.find(c => c.id === id);
      if (cat) {
        handleEditCategorySchema(cat);
      }
      return;
    }
    setEditingInstId(id);
    setEditingInstName(currentName);
  };

  const handleSaveInstitutionRename = async (id: number) => {
    if (!editingInstName || editingInstName.trim() === '') return;
    try {
      setMetaStatus("Updating institution...");
      const res = await fetch(`${API_BASE_URL}/api/metadata/institutions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingInstName.trim() })
      });
      if (res.ok) {
        setMetaStatus("Institution updated successfully.");
        setEditingInstId(null);
        fetchInstitutionsList();
        onRefresh();
        setTimeout(() => setMetaStatus(null), 3000);
      } else {
        const err = await res.json();
        setMetaStatus(`Failed to update institution: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      setMetaStatus("Error updating institution");
    }
  };

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName) return;
    try {
      setMetaStatus("Adding Person...");
      const res = await fetch(`${API_BASE_URL}/api/metadata/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPersonName.trim(), role: newPersonRole, risk_tolerance: newPersonRiskTolerance })
      });
      if (res.ok) {
        setMetaStatus("Person added successfully!");
        setNewPersonName('');
        setNewPersonRole('Primary Owner');
        setNewPersonRiskTolerance('Moderate');
        fetchPeopleList();
        onRefresh();
        setTimeout(() => setMetaStatus(null), 3000);
      } else {
        setMetaStatus("Failed to add person");
      }
    } catch (err) {
      console.error(err);
      setMetaStatus("Error adding person");
    }
  };

  const handleEditPerson = (id: number, currentName: string, currentRole: string, currentRiskTolerance: string) => {
    setEditingPersonId(id);
    setEditingPersonName(currentName);
    setEditingPersonRole(currentRole);
    setEditingPersonRiskTolerance(currentRiskTolerance || 'Moderate');
  };

  const handleSavePersonEdit = async (id: number) => {
    if (!editingPersonName || editingPersonName.trim() === '') return;
    try {
      setMetaStatus("Updating person...");
      const res = await fetch(`${API_BASE_URL}/api/metadata/people/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingPersonName.trim(), role: editingPersonRole, risk_tolerance: editingPersonRiskTolerance })
      });
      if (res.ok) {
        setMetaStatus("Person updated successfully.");
        setEditingPersonId(null);
        fetchPeopleList();
        onRefresh();
        setTimeout(() => setMetaStatus(null), 3000);
      } else {
        const err = await res.json();
        setMetaStatus(`Failed to update person: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      setMetaStatus("Error updating person");
    }
  };

  const handleEditCategorySchema = (cat: any) => {
    setEditingCategoryId(cat.id);
    setNewCatName(cat.name);
    setNewCatType(cat.entity_type);

    let parsed: any[] = [];
    if (cat.fields_definition) {
      try {
        const fields = typeof cat.fields_definition === 'string'
          ? JSON.parse(cat.fields_definition)
          : cat.fields_definition;
        if (Array.isArray(fields)) {
          parsed = fields;
        } else if (typeof fields === 'object' && fields !== null) {
          parsed = Object.keys(fields).map(key => ({
            name: key,
            label: key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            type: fields[key] || 'text'
          }));
        }
      } catch (e) {
        console.error("Error parsing fields definition:", e);
      }
    }
    setCustomFields(parsed);
    setActiveSubTab('categories');
  };

  const addFieldRow = () => {
    setCustomFields(prev => [...prev, { name: '', label: '', type: 'text' }]);
  };

  const removeFieldRow = (idx: number) => {
    setCustomFields(prev => prev.filter((_, i) => i !== idx));
  };

  const updateFieldRow = (idx: number, key: 'name' | 'label' | 'type', value: string) => {
    setCustomFields(prev => prev.map((f, i) => {
      if (i === idx) {
        const updated = { ...f, [key]: value };
        if (key === 'label') {
          // Automatic key slugifier sanitizer
          const autoKey = value
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_');
          // Only auto-generate key if key is empty or matches the previous label's slug
          const oldAutoKey = f.label
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_');
          if (!f.name || f.name === oldAutoKey) {
            updated.name = autoKey;
          }
        }
        return updated;
      }
      return f;
    }));
  };

  const resetCategoryForm = () => {
    setNewCatName('');
    setNewCatType('Asset');
    setCustomFields([]);
    setEditingCategoryId(null);
  };

  const fetchDatabaseSettings = () => {
    fetch(`${API_BASE_URL}/api/settings/database`)
      .then(res => res.json())
      .then(d => {
        setDbSettings(d);
        setBackupOnOpen(d.backup_on_open ?? true);
        setBackupOnClose(d.backup_on_close ?? true);
        setBackupCountLimit(d.backup_count_limit ?? 10);
        setCustomBackupDir(d.custom_backup_dir ?? '');
      })
      .catch(err => console.error(err));
  };

  const handleSaveBackupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaveSettingsStatus("Saving...");
      const res = await fetch(`${API_BASE_URL}/api/settings/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup_on_open: backupOnOpen,
          backup_on_close: backupOnClose,
          backup_count_limit: backupCountLimit,
          custom_backup_dir: customBackupDir
        })
      });
      if (res.ok) {
        setSaveSettingsStatus("Saved!");
        fetchDatabaseSettings();
        fetchBackups();
        setTimeout(() => setSaveSettingsStatus(null), 3000);
      } else {
        setSaveSettingsStatus("Failed to save");
      }
    } catch (err) {
      console.error(err);
      setSaveSettingsStatus("Error");
    }
  };

  const handleSelectDatabase = async (mode: 'open' | 'create') => {
    const electron = (window as any).require ? (window as any).require('electron') : null;
    if (!electron) {
      if (showToast) showToast("Database switching is only supported inside the Desktop application wrapper.", "info");
      else alert("Database switching is only supported inside the Desktop application wrapper.");
      return;
    }

    try {
      const selectedPath = await electron.ipcRenderer.invoke('select-db-file', mode);
      if (!selectedPath) return; // Cancelled

      const res = await fetch(`${API_BASE_URL}/api/settings/database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath })
      });

      if (res.ok) {
        const successMsg = `Successfully switched active database file to:\n${selectedPath}`;
        if (showToast) showToast(successMsg, "success");
        else alert(successMsg);
        onRefresh();
        fetchDatabaseSettings();
        fetchBackups();
      } else {
        const err = await res.json();
        const failMsg = `Failed to switch: ${err.detail || "Unknown error"}`;
        if (showToast) showToast(failMsg, "error");
        else alert(failMsg);
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Error picking database file", "error");
      else alert("Error picking database file");
    }
  };

  const handleQuickSwitch = async (path: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (res.ok) {
        if (showToast) showToast(`Successfully switched to database at:\n${path}`, "success");
        onRefresh();
        fetchDatabaseSettings();
        fetchBackups();
      } else {
        const err = await res.json();
        const failMsg = `Failed to switch: ${err.detail}`;
        if (showToast) showToast(failMsg, "error");
        else alert(failMsg);
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Network error", "error");
      else alert("Network error");
    }
  };

  const fetchBackups = () => {
    fetch(`${API_BASE_URL}/api/backup/list`)
      .then(res => res.json())
      .then(d => setBackupsList(d))
      .catch(err => console.error(err));
  };

  const handleMMexImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setImportStatus("Importing...");
      const res = await fetch(`${API_BASE_URL}/api/import/mmex`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const result = await res.json();
        setImportStatus(`Success! Synced ${result.imported} accounts.`);
        onRefresh();
      } else {
        const err = await res.json();
        setImportStatus(`Import failed: ${err.detail || "Invalid CSV layout"}`);
      }
    } catch (err) {
      setImportStatus("Network error during import");
    }
  };

  const handleCreateBackup = async () => {
    try {
      setBackupStatus("Creating backup...");
      const res = await fetch(`${API_BASE_URL}/api/backup/create`, { method: 'POST' });
      if (res.ok) {
        await res.json();
        setBackupStatus("Backup saved successfully!");
        fetchBackups();
      }
    } catch (err) {
      setBackupStatus("Failed to create backup");
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    try {
      const formData = new FormData();
      formData.append('backup_name', filename);
      const res = await fetch(`${API_BASE_URL}/api/backup/restore`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        if (showToast) showToast("Backup restored successfully!", "success");
        else alert("Backup restored successfully!");
        onRefresh();
      } else {
        if (showToast) showToast("Restore failed", "error");
        else alert("Restore failed");
      }
    } catch (err) {
      if (showToast) showToast("Network error", "error");
      else alert("Network error");
    }
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <h1 className="page-title">Settings &amp; Systems Control</h1>
        <p className="page-subtitle">Configure workspace files, manage replication backups, set decision parameters, and import planning data.</p>
      </div>

      {/* Sub tabs navigation */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveSubTab('database')}
          className={`sidebar-item ${activeSubTab === 'database' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          Database &amp; Backups
        </button>
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`sidebar-item ${activeSubTab === 'rules' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          Rules Engine
        </button>
        <button
          onClick={() => setActiveSubTab('categories')}
          className={`sidebar-item ${activeSubTab === 'categories' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          Category Schema Builder
        </button>
        <button
          onClick={() => setActiveSubTab('import')}
          className={`sidebar-item ${activeSubTab === 'import' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          Data Import
        </button>
        <button
          onClick={() => setActiveSubTab('ai')}
          className={`sidebar-item ${activeSubTab === 'ai' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          AI Assistant
        </button>
      </div>

      {metaStatus && (
        <div style={{ padding: '12px 16px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa', borderRadius: '8px', marginBottom: '24px', fontSize: '12px' }}>
          {metaStatus}
        </div>
      )}

      {/* TAB 1: DATABASE & BACKUPS */}
      {activeSubTab === 'database' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '32px' }}>
          {/* Active Database Settings */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} style={{ color: 'var(--accent-light)' }} />
              Active Database Settings
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
              Define where your portfolio plan database is saved. Switch between plans or load custom databases.
            </p>

            <div style={{ wordBreak: 'break-all', fontSize: '13px', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', marginBottom: '16px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Currently Active Database Path</span>
              <strong style={{ color: 'var(--accent-light)', fontSize: '11px', fontFamily: 'monospace' }}>{dbSettings ? dbSettings.active_path : "Loading..."}</strong>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }} onClick={() => handleSelectDatabase('open')}>
                Open Existing DB
              </button>
              <button className="btn btn-secondary" style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }} onClick={() => handleSelectDatabase('create')}>
                Create New DB
              </button>
            </div>

            {dbSettings && dbSettings.recent_databases && dbSettings.recent_databases.length > 1 && (
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '14px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Recent Databases</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dbSettings.recent_databases.map((path, idx) => {
                    if (path === dbSettings.active_path) return null;
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 8px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }} title={path}>
                          {path.split(/[\\/]/).pop()}
                        </span>
                        <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => handleQuickSwitch(path)}>
                          Switch
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Database Backups replication */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} style={{ color: 'var(--accent-light)' }} />
              SQLite Database Backups
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
              Configure automatic replication profiles like Money Manager Ex (MMEx) to safeguard your portfolios.
            </p>

            <form onSubmit={handleSaveBackupSettings} style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>Automatic Replication Rules</h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={backupOnOpen}
                    onChange={e => setBackupOnOpen(e.target.checked)}
                  />
                  Backup on app startup (Open DB)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={backupOnClose}
                    onChange={e => setBackupOnClose(e.target.checked)}
                  />
                  Backup on app exit (Close DB)
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Retained Backups Count Limit:</span>
                  <input
                    type="number"
                    className="form-control"
                    style={{ width: '60px', padding: '4px 8px', fontSize: '12px' }}
                    value={backupCountLimit}
                    onChange={e => setBackupCountLimit(parseInt(e.target.value) || 5)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Custom Backup Directory Path:</span>
                  <input
                    type="text"
                    className="form-control"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                    placeholder="e.g. D:\backups"
                    value={customBackupDir}
                    onChange={e => setCustomBackupDir(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  Save Rules
                </button>
                {saveSettingsStatus && (
                  <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>{saveSettingsStatus}</span>
                )}
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button className="btn btn-secondary" onClick={handleCreateBackup}>
                Create Backup Point Now
              </button>

              {backupStatus && (
                <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--success-bg)', color: 'var(--success)' }}>
                  {backupStatus}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>Available Backup Snapshots</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {backupsList.length > 0 ? (
                    backupsList.map((filename, idx) => {
                      const isRestoring = restoringBackupFilename === filename;
                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', maxWidth: '200px' }} title={filename}>{filename}</span>
                          {isRestoring ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ color: 'var(--warning-light)', fontSize: '11px', fontWeight: 500 }}>Overwrite?</span>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '2px 6px', fontSize: '10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', minWidth: 'auto' }}
                                onClick={() => {
                                  handleRestoreBackup(filename);
                                  setRestoringBackupFilename(null);
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '2px 6px', fontSize: '10px', minWidth: 'auto' }}
                                onClick={() => setRestoringBackupFilename(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '10px' }} onClick={() => setRestoringBackupFilename(filename)}>
                              Restore
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px 0' }}>No backups found.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RULES PARAMETERS */}
      {activeSubTab === 'rules' && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
            Policy Rules Parameters
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {rules.map((rule: any) => (
              <div key={rule.rule_key} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <strong style={{ fontSize: '13px', color: '#fff' }}>{rule.rule_name}</strong>
                      <InfoTooltip articles={knowledgeArticles} ruleKey={rule.rule_key} />
                    </span>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{rule.description}</p>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={rule.is_enabled === 1}
                      onChange={e => handleUpdateRule(rule.rule_key, rule.value, e.target.checked)}
                    />
                    Active
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="number"
                    className="form-control"
                    style={{ padding: '6px 12px', fontSize: '12px', flex: 1 }}
                    value={rule.value}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setRules(rules.map(r => r.rule_key === rule.rule_key ? { ...r, value: val } : r));
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                    onClick={() => handleUpdateRule(rule.rule_key, rule.value, rule.is_enabled === 1)}
                  >
                    {ruleSaveStatus[rule.rule_key] || 'Update'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CATEGORY SCHEMA BUILDER */}
      {activeSubTab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>

          {/* Left Column: Category Schema Explorer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
              Active Schema Registry
            </h3>

            {/* Group Categories by Entity Type */}
            {['Account', 'Asset', 'Liability', 'Income', 'Expense'].map(type => {
              const typeCats = categories.filter(c => c.entity_type === type);
              if (typeCats.length === 0) return null;

              const getBadgeStyle = (entityType: string) => {
                let color = '#3b82f6';
                let bg = 'rgba(59, 130, 246, 0.1)';
                let border = 'rgba(59, 130, 246, 0.2)';

                if (entityType === 'Asset') {
                  color = '#10b981';
                  bg = 'rgba(16, 185, 129, 0.1)';
                  border = 'rgba(16, 185, 129, 0.2)';
                } else if (entityType === 'Liability') {
                  color = '#f97316';
                  bg = 'rgba(249, 115, 22, 0.1)';
                  border = 'rgba(249, 115, 22, 0.2)';
                } else if (entityType === 'Income') {
                  color = '#8b5cf6';
                  bg = 'rgba(139, 92, 246, 0.1)';
                  border = 'rgba(139, 92, 246, 0.2)';
                } else if (entityType === 'Expense') {
                  color = '#ec4899';
                  bg = 'rgba(236, 72, 153, 0.1)';
                  border = 'rgba(236, 72, 153, 0.2)';
                }

                return {
                  color,
                  background: bg,
                  border: `1px solid ${border}`,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '9px',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.5px'
                };
              };

              const badgeStyle = getBadgeStyle(type);

              return (
                <div key={type} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px dashed rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: 700, color: badgeStyle.color, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                      {type} Categories
                    </h4>
                    <span style={badgeStyle}>{type} Registry</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {typeCats.map(cat => {
                      let fieldsList: any[] = [];
                      if (cat.fields_definition) {
                        try {
                          const parsed = typeof cat.fields_definition === 'string'
                            ? JSON.parse(cat.fields_definition)
                            : cat.fields_definition;
                          if (Array.isArray(parsed)) {
                            fieldsList = parsed;
                          }
                        } catch(e) {}
                      }

                      return (
                        <div key={cat.id} className="glass-panel" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {deletingCategoryId === cat.id ? (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
                                <span style={{ color: 'var(--danger-light)', fontSize: '12px', fontWeight: 500 }}>Confirm Delete?</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '2px 6px', fontSize: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', minWidth: 'auto' }}
                                    onClick={() => handleDeleteMetadata('categories', cat.id)}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '2px 6px', fontSize: '10px', minWidth: 'auto' }}
                                    onClick={() => setDeletingCategoryId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <strong style={{ fontSize: '13px', color: '#fff' }}>{cat.name}</strong>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <Edit2
                                    size={12}
                                    style={{ color: 'var(--info)', cursor: 'pointer', opacity: 0.8 }}
                                    onClick={() => handleEditCategorySchema(cat)}
                                  />
                                  <Trash2
                                    size={12}
                                    style={{ color: '#ef4444', cursor: 'pointer', opacity: 0.8 }}
                                    onClick={() => setDeletingCategoryId(cat.id)}
                                  />
                                </div>
                              </>
                            )}
                          </div>

                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {fieldsList.length > 0 ? (
                              <ul style={{ paddingLeft: '14px', margin: 0 }}>
                                {fieldsList.map((f, i) => (
                                  <li key={i}>
                                    <span style={{ color: '#e2e8f0' }}>{f.label || f.name}</span> <span style={{ color: '#a78bfa', fontSize: '9px' }}>({f.type})</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span style={{ fontStyle: 'italic' }}>Standard fields only</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Institutions Management List */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '16px', marginTop: '12px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', borderBottom: '1px dashed rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                Financial Institutions
              </h4>

              {/* Inline Simplified Creator Form */}
              <form onSubmit={handleAddInstitution} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ flex: 1, padding: '6px 12px', fontSize: '12px', height: '32px' }}
                  placeholder="Register new institution... (e.g. Chase)"
                  required
                  value={newInstName}
                  onChange={e => setNewInstName(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '0 16px', fontSize: '12px', height: '32px' }}>
                  Add
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {[...institutions].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((inst: any) => {
                  const isEditing = editingInstId === inst.id;
                  const isDeleting = deletingInstId === inst.id;
                  return (
                    <div key={inst.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '8px', fontSize: '12px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
                          <input
                            type="text"
                            className="form-control"
                            style={{ flex: 1, padding: '4px 8px', fontSize: '12px', height: '28px' }}
                            value={editingInstName}
                            onChange={e => setEditingInstName(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', minWidth: 'auto', height: '28px' }}
                            onClick={() => handleSaveInstitutionRename(inst.id)}
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', minWidth: 'auto', height: '28px' }}
                            onClick={() => setEditingInstId(null)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : isDeleting ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
                          <span style={{ color: 'var(--danger-light)', fontWeight: 500 }}>Confirm Delete?</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', minWidth: 'auto', height: '26px' }}
                              onClick={() => handleDeleteMetadata('institutions', inst.id)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', minWidth: 'auto', height: '26px' }}
                              onClick={() => setDeletingInstId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontWeight: 500 }}>{inst.name}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '10px', minWidth: 'auto', borderRadius: '6px' }}
                              onClick={() => handleEditMetadata('institutions', inst.id, inst.name)}
                            >
                              <Edit2 size={11} style={{ color: 'var(--info)' }} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '10px', minWidth: 'auto', borderRadius: '6px' }}
                              onClick={() => setDeletingInstId(inst.id)}
                            >
                              <Trash2 size={11} style={{ color: '#ef4444' }} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* People Management List */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '16px', marginTop: '12px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', borderBottom: '1px dashed rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                People (Account/Portfolio Owners)
              </h4>

              {/* Inline Simplified Creator Form */}
              <form onSubmit={handleAddPerson} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ flex: 1, padding: '6px 12px', fontSize: '12px', height: '32px' }}
                  placeholder="Add a person... (e.g. Amit Mishra)"
                  required
                  value={newPersonName}
                  onChange={e => setNewPersonName(e.target.value)}
                />
                <select
                  className="form-control"
                  style={{ padding: '6px 12px', fontSize: '12px', height: '32px', minWidth: '130px' }}
                  value={newPersonRole}
                  onChange={e => setNewPersonRole(e.target.value)}
                >
                  <option value="Primary Owner">Primary Owner</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Dependent">Dependent</option>
                </select>
                <select
                  className="form-control"
                  style={{ padding: '6px 12px', fontSize: '12px', height: '32px', minWidth: '130px' }}
                  value={newPersonRiskTolerance}
                  onChange={e => setNewPersonRiskTolerance(e.target.value)}
                >
                  <option value="Conservative">Conservative</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Aggressive">Aggressive</option>
                </select>
                <button type="submit" className="btn btn-primary" style={{ padding: '0 16px', fontSize: '12px', height: '32px' }}>
                  Add
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {people.map((person: any) => {
                  const isEditing = editingPersonId === person.id;
                  const isDeleting = deletingPersonId === person.id;
                  return (
                    <div key={person.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '8px', fontSize: '12px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
                          <input
                            type="text"
                            className="form-control"
                            style={{ flex: 1, padding: '4px 8px', fontSize: '12px', height: '28px' }}
                            value={editingPersonName}
                            onChange={e => setEditingPersonName(e.target.value)}
                            required
                          />
                          <select
                            className="form-control"
                            style={{ padding: '4px 8px', fontSize: '12px', height: '28px', minWidth: '110px' }}
                            value={editingPersonRole}
                            onChange={e => setEditingPersonRole(e.target.value)}
                          >
                            <option value="Primary Owner">Primary Owner</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Dependent">Dependent</option>
                          </select>
                          <select
                            className="form-control"
                            style={{ padding: '4px 8px', fontSize: '12px', height: '28px', minWidth: '110px' }}
                            value={editingPersonRiskTolerance}
                            onChange={e => setEditingPersonRiskTolerance(e.target.value)}
                          >
                            <option value="Conservative">Conservative</option>
                            <option value="Moderate">Moderate</option>
                            <option value="Aggressive">Aggressive</option>
                          </select>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', minWidth: 'auto', height: '28px' }}
                            onClick={() => handleSavePersonEdit(person.id)}
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', minWidth: 'auto', height: '28px' }}
                            onClick={() => setEditingPersonId(null)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : isDeleting ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
                          <span style={{ color: 'var(--danger-light)', fontWeight: 500 }}>Confirm Delete?</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', minWidth: 'auto', height: '26px' }}
                              onClick={() => handleDeleteMetadata('people', person.id)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', minWidth: 'auto', height: '26px' }}
                              onClick={() => setDeletingPersonId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontWeight: 500 }}>{person.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({person.role} · {person.risk_tolerance || 'Moderate'})</span></span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '10px', minWidth: 'auto', borderRadius: '6px' }}
                              onClick={() => handleEditPerson(person.id, person.name, person.role, person.risk_tolerance)}
                            >
                              <Edit2 size={11} style={{ color: 'var(--info)' }} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '10px', minWidth: 'auto', borderRadius: '6px' }}
                              onClick={() => setDeletingPersonId(person.id)}
                            >
                              <Trash2 size={11} style={{ color: '#ef4444' }} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {people.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                    No people added yet. Add one above, then it becomes selectable as an Account's Owner.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Visual Interactive Builder & Institution Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Visual Schema Builder Form */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} />
                {editingCategoryId !== null ? 'Modify Category Schema' : 'Add Custom Product Category'}
              </h3>

              <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Category Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Mutual Fund"
                      required
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                    />
                  </div>
                  <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Entity Type</label>
                    <select
                      className="form-control"
                      value={newCatType}
                      onChange={e => setNewCatType(e.target.value)}
                      disabled={editingCategoryId !== null}
                    >
                      <option value="Asset">Asset</option>
                      <option value="Liability">Liability</option>
                      <option value="Account">Account</option>
                      <option value="Income">Income</option>
                      <option value="Expense">Expense</option>
                    </select>
                  </div>
                </div>

                {/* Field Spec Builder */}
                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Custom Properties Schema</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        className="form-control"
                        style={{ padding: '3px 6px', fontSize: '10px', width: '130px', height: '24px' }}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'mutual_fund') {
                            setCustomFields([
                              { name: 'units', label: 'Units', type: 'number' },
                              { name: 'nav', label: 'NAV', type: 'number' }
                            ]);
                          } else if (val === 'demat') {
                            setCustomFields([
                              { name: 'broker_name', label: 'Broker Name', type: 'text' },
                              { name: 'dp_id', label: 'DP ID', type: 'text' }
                            ]);
                          } else if (val === 'insurance') {
                            setCustomFields([
                              { name: 'policy_number', label: 'Policy Number', type: 'text' },
                              { name: 'coverage', label: 'Coverage Amount', type: 'number' },
                              { name: 'premium', label: 'Premium Amount', type: 'number' },
                              { name: 'renewal_date', label: 'Renewal Date', type: 'date' }
                            ]);
                          } else if (val === 'credit_card') {
                            setCustomFields([
                              { name: 'credit_limit', label: 'Credit Limit', type: 'number' },
                              { name: 'statement_date', label: 'Statement Day of Month', type: 'number' },
                              { name: 'due_date', label: 'Due Day of Month', type: 'number' }
                            ]);
                          }
                          e.target.value = ''; // Reset select
                        }}
                      >
                        <option value="">Load Template...</option>
                        <option value="mutual_fund">Mutual Fund</option>
                        <option value="demat">Demat Account</option>
                        <option value="insurance">Insurance Policy</option>
                        <option value="credit_card">Credit Card</option>
                      </select>

                      <button type="button" className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '10px' }} onClick={addFieldRow}>
                        + Add Row
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    {customFields.length > 0 ? (
                      customFields.map((field, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="database_key (e.g. units)"
                            className="form-control"
                            style={{ flex: 1.2, padding: '4px 8px', fontSize: '11px', fontFamily: 'monospace' }}
                            value={field.name}
                            onChange={e => updateFieldRow(idx, 'name', e.target.value)}
                            required
                          />
                          <input
                            type="text"
                            placeholder="Field Label (e.g. Units)"
                            className="form-control"
                            style={{ flex: 1.5, padding: '4px 8px', fontSize: '11px' }}
                            value={field.label}
                            onChange={e => updateFieldRow(idx, 'label', e.target.value)}
                            required
                          />
                          <select
                            className="form-control"
                            style={{ width: '90px', padding: '4px', fontSize: '11px' }}
                            value={field.type}
                            onChange={e => updateFieldRow(idx, 'type', e.target.value as any)}
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                          </select>
                          <Trash2
                            size={14}
                            style={{ color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}
                            onClick={() => removeFieldRow(idx)}
                          />
                        </div>
                      ))
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0' }}>
                        No custom fields spec. Category will use core properties only. Click Add to append properties.
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    {editingCategoryId !== null ? 'Update Category Schema' : 'Register Category'}
                  </button>
                  {editingCategoryId !== null && (
                    <button type="button" className="btn btn-secondary" onClick={resetCategoryForm}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

          </div>
        </div>
      )}

      {/* TAB 4: DATA IMPORT */}
      {activeSubTab === 'import' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '32px' }}>
          {/* MMex Import Panel */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={16} style={{ color: 'var(--accent-light)' }} />
              Money Manager Ex (MMex) Import
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
              Upload your exported MMex Accounts list CSV. The application will match balances based on Account names and update them immediately.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="file"
                accept=".csv"
                onChange={handleMMexImport}
                id="csv_import_file"
                style={{ display: 'none' }}
              />
              <label
                htmlFor="csv_import_file"
                className="btn btn-secondary"
                style={{ width: '100%', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
              >
                Choose MMex Accounts CSV File
              </label>

              {importStatus && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  background: importStatus.includes('Success') ? 'var(--success-bg)' : 'rgba(255,255,255,0.02)',
                  color: importStatus.includes('Success') ? 'var(--success)' : 'var(--text-secondary)'
                }}>
                  {importStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'ai' && (
        <div className="glass-panel" style={{ padding: '24px', maxWidth: '560px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>AI Assistant</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
            Optional. Off by default — no network request of any kind is made unless you configure a provider here.
            The AI only explains numbers Artha has already calculated; it never computes or overrides anything itself.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Provider</label>
              <select className="form-control" value={aiProvider} onChange={(e) => setAiProvider(e.target.value as any)}>
                <option value="none">None (disabled)</option>
                <option value="ollama">Ollama (local, runs on your machine)</option>
                <option value="openai">OpenAI-compatible (cloud, API key required)</option>
                <option value="anthropic">Anthropic (cloud, API key required)</option>
              </select>
            </div>

            {aiProvider === 'ollama' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ollama Endpoint</label>
                  <input className="form-control" placeholder="http://localhost:11434" value={aiEndpoint} onChange={(e) => setAiEndpoint(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Model</label>
                  <input className="form-control" placeholder="llama3.1" value={aiModel} onChange={(e) => setAiModel(e.target.value)} />
                </div>
              </>
            )}

            {(aiProvider === 'openai' || aiProvider === 'anthropic') && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>API Key</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder={aiApiKeySet ? 'Key saved — leave blank to keep it' : 'Enter API key'}
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Model</label>
                  <input
                    className="form-control"
                    placeholder={aiProvider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022'}
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                </div>
                {aiProvider === 'openai' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Custom Base URL (optional, for OpenAI-compatible APIs)</label>
                    <input className="form-control" placeholder="https://api.openai.com/v1" value={aiEndpoint} onChange={(e) => setAiEndpoint(e.target.value)} />
                  </div>
                )}
                <div style={{
                  padding: '10px 14px', borderRadius: '10px', fontSize: '11.5px', lineHeight: 1.5,
                  background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--text-secondary)',
                }}>
                  Your API key is stored locally in this app's database, in plain text — the same way all your other
                  financial data is stored, with no additional encryption. Do not use a key with elevated permissions.
                </div>
              </>
            )}

            {aiProvider !== 'none' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max Response Length (tokens)</label>
                <input type="number" className="form-control" value={aiMaxTokens} onChange={(e) => setAiMaxTokens(parseInt(e.target.value) || 500)} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ padding: '8px 18px' }} onClick={handleSaveAiSettings}>
                Save
              </button>
              {aiProvider !== 'none' && (
                <button className="btn btn-secondary" style={{ padding: '8px 18px' }} onClick={handleTestAiConnection} disabled={aiTesting}>
                  {aiTesting ? 'Testing...' : 'Test Connection'}
                </button>
              )}
              {aiStatus && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{aiStatus}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
