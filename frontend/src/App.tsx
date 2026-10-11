import React, { useEffect, useRef, useState } from 'react';
import { Database, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { InitData } from './types';
import { Dashboard } from './components/Dashboard';
import { EntityGrid } from './components/EntityGrid';
import { Simulations } from './components/Simulations';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import { FinancialCalendar } from './components/FinancialCalendar';
import { LoanPlanner } from './components/LoanPlanner';
import { CashFlowPlanning } from './components/CashFlowPlanning';
import { IncomeExpenses } from './components/IncomeExpenses';
import { TransactionsLedger } from './components/TransactionsLedger';
import { BudgetPlanner } from './components/BudgetPlanner';
import { CreditCards } from './components/CreditCards';
import { Taxation } from './components/Taxation';
import { AskArtha } from './components/AskArtha';
import { Help } from './components/Help';
import { ArthaMark } from './components/branding/ArthaMark';
import { useBranding } from './components/branding/useBranding';
import { API_BASE_URL } from './config';
import { TopBar, CommandPalette, NavigateOptions } from './components/TopBar';
import { AppCommand, NAV_GROUPS, NAV_GROUP_LABELS, NEW_ITEMS } from './navigation';
import { isDesktop, onMenuCommand, selectDatabaseFile } from './platform';

const App: React.FC = () => {
  const { variant: brandVariant, accentColor: brandAccent } = useBranding();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing Financial OS...');
  const [data, setData] = useState<InitData | null>(null);
  
  // Cache scenario arguments for simulation redirect
  const [simRedirectParams, setSimRedirectParams] = useState<any>(null);

  // Requests from the top bar, the Go-to search and the desktop menu: open a page's add
  // form, filter it to a record, or open a Settings section. Cleared on ordinary navigation.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addRequest, setAddRequest] = useState<{ page: string; view?: 'income' | 'expenses'; nonce: number } | null>(null);
  const [searchSeed, setSearchSeed] = useState<{ page: string; text: string; nonce: number } | null>(null);
  const [settingsSection, setSettingsSection] = useState<{ id: string; nonce: number } | null>(null);
  const [statusTick, setStatusTick] = useState(0);

  // Toast notifications state
  interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const fetchFinanceData = async () => {
    let attempts = 0;
    const maxAttempts = 15;
    const delay = 1000;

    while (attempts < maxAttempts) {
      attempts++;
      setStatusMessage(`Starting sidecar API engine (Attempt ${attempts}/${maxAttempts})...`);
      try {
        const res = await fetch(`${API_BASE_URL}/api/init`);
        if (res.ok) {
          setStatusMessage("API responded! Reading preferences and verifying database...");
          const d = await res.json();
          if (d && Array.isArray(d.institutions)) {
            d.institutions = [...d.institutions].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
          }
          setData(d);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn(`Attempt ${attempts} failed: Backend not ready yet.`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const handleNavigate = (tab: string, simParams?: any) => {
    if (simParams) {
      setSimRedirectParams(simParams);
    } else {
      setSimRedirectParams(null);
    }
    setAddRequest(null);
    setSearchSeed(null);
    setActiveTab(tab);
  };

  const navigateTo = (page: string, opts?: NavigateOptions) => {
    handleNavigate(page);
    if (opts?.search) setSearchSeed({ page, text: opts.search, nonce: Date.now() });
    if (opts?.settingsSection) setSettingsSection({ id: opts.settingsSection, nonce: Date.now() });
  };

  const switchDatabase = async (mode: 'open' | 'create') => {
    if (!isDesktop()) {
      showToast('Opening another database file is available in the desktop app.', 'info');
      return;
    }
    const path = await selectDatabaseFile(mode).catch(() => null);
    if (!path) return;
    const res = await fetch(`${API_BASE_URL}/api/settings/database`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
    }).catch(() => null);
    if (res?.ok) {
      showToast(`Now using ${path.split(/[\\/]/).pop()}`, 'success');
      fetchFinanceData();
    } else {
      showToast("Couldn't open that database file.", 'error');
    }
  };

  /** One handler for the top bar, the Go-to search and the desktop menu. */
  const runCommand = async (cmd: AppCommand) => {
    const create = NEW_ITEMS.find((n) => n.command === cmd);
    if (create) {
      handleNavigate(create.page);
      setAddRequest({ page: create.page, view: cmd === 'new-expense' ? 'expenses' : cmd === 'new-income' ? 'income' : undefined, nonce: Date.now() });
      return;
    }
    switch (cmd) {
      case 'goto': setPaletteOpen(true); break;
      case 'settings': navigateTo('settings'); break;
      case 'help': navigateTo('help'); break;
      case 'open-database': await switchDatabase('open'); break;
      case 'new-database': await switchDatabase('create'); break;
      case 'backup-now': {
        const res = await fetch(`${API_BASE_URL}/api/backup/create`, { method: 'POST' }).catch(() => null);
        showToast(res?.ok ? 'Backup saved' : 'Backup failed', res?.ok ? 'success' : 'error');
        setStatusTick((t) => t + 1);
        break;
      }
    }
  };

  // Ctrl/Cmd+K opens Go-to anywhere; the desktop menu's commands arrive over the preload bridge.
  const commandRef = useRef(runCommand);
  commandRef.current = runCommand;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    const unsubscribe = onMenuCommand((c) => { void commandRef.current(c); });
    return () => { window.removeEventListener('keydown', onKey); unsubscribe(); };
  }, []);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#07090e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid rgba(139, 92, 246, 0.1)',
          borderTop: '3px solid #8b5cf6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }}></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <span style={{ color: '#fff', fontSize: '15px', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '8px' }}>
          Artha
        </span>
        <span style={{ color: '#94a3b8', fontSize: '13px' }}>
          {statusMessage}
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#07090e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'Inter, sans-serif'
      }}>
        <Database size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Backend Service Unreachable</h2>
        <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '400px', lineHeight: '1.5', marginBottom: '24px' }}>
          The local FastAPI server did not respond after 15 connection attempts. Verify that the application was compiled correctly and is not blocked by a firewall.
        </p>
        <button 
          className="btn btn-primary"
          style={{ padding: '8px 24px', fontSize: '13px' }}
          onClick={() => {
            setLoading(true);
            fetchFinanceData();
          }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <ArthaMark variant={brandVariant} color={brandAccent} size={22} />
          <span className="logo-text">Artha</span>
        </div>

        {/* flex:1 + minHeight:0 (not height:100%) so the nav takes the space left
            after the logo row and lets .sidebar-menu shrink and scroll inside it */}
        <nav style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <ul className="sidebar-menu">
            {NAV_GROUPS.map((group, gi) => (
              <React.Fragment key={gi}>
                <li className="sidebar-heading" aria-hidden>{NAV_GROUP_LABELS[gi]}</li>
                {group.map((item) => (
                  <li key={item.id}>
                    <div
                      className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                      aria-current={activeTab === item.id ? 'page' : undefined}
                      onClick={() => handleNavigate(item.id)}
                    >
                      {item.icon}
                      {item.label}
                    </div>
                  </li>
                ))}
              </React.Fragment>
            ))}
          </ul>

          <div style={{ padding: '8px', borderTop: '1px solid var(--border-glass)', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
               <Database size={10} />
               <span>Artha v2.0.0</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content Render */}
      <main className="main-content">
        <TopBar data={data} refreshKey={statusTick} onCommand={(c) => { void runCommand(c); }} onNavigate={navigateTo} />
        {activeTab === 'dashboard' && (
          <Dashboard data={data} onNavigate={handleNavigate} onGo={navigateTo} onCommand={(c) => { void runCommand(c); }} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'cash-flow' && (
          <CashFlowPlanning data={data} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'transactions' && (
          <TransactionsLedger data={data} onRefresh={fetchFinanceData} showToast={showToast} addRequest={addRequest?.page === 'transactions' ? addRequest.nonce : undefined} />
        )}
        {activeTab === 'income-expenses' && (
          <IncomeExpenses data={data} onRefresh={fetchFinanceData} showToast={showToast}
            addRequest={addRequest?.page === 'income-expenses' && addRequest.view ? { view: addRequest.view, nonce: addRequest.nonce } : null}
            searchSeed={searchSeed?.page === 'income-expenses' ? searchSeed : null} />
        )}
        {activeTab === 'budget-planner' && (
          <BudgetPlanner data={data} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'accounts' && (
          <EntityGrid
            entityType="accounts"
            entities={data.accounts}
            addRequest={addRequest?.page === 'accounts' ? addRequest.nonce : undefined}
            searchSeed={searchSeed?.page === 'accounts' ? searchSeed : null}
            categories={data.categories}
            institutions={data.institutions}
            people={data.people}
            goals={data.goals}
            onRefresh={fetchFinanceData}
            showToast={showToast}
          />
        )}
        {activeTab === 'assets' && (
          <EntityGrid
            entityType="assets"
            entities={data.assets}
            addRequest={addRequest?.page === 'assets' ? addRequest.nonce : undefined}
            searchSeed={searchSeed?.page === 'assets' ? searchSeed : null}
            categories={data.categories}
            institutions={data.institutions}
            people={data.people}
            goals={data.goals}
            liabilities={data.liabilities}
            properties={data.assets.filter((a) => a.category_name === 'Property')}
            onRefresh={fetchFinanceData}
            showToast={showToast}
          />
        )}
        {activeTab === 'liabilities' && (
          <EntityGrid
            entityType="liabilities"
            entities={data.liabilities}
            addRequest={addRequest?.page === 'liabilities' ? addRequest.nonce : undefined}
            searchSeed={searchSeed?.page === 'liabilities' ? searchSeed : null}
            categories={data.categories}
            institutions={data.institutions}
            people={data.people}
            goals={data.goals}
            liabilities={data.liabilities}
            properties={data.assets.filter((a) => a.category_name === 'Property')}
            onRefresh={fetchFinanceData}
            showToast={showToast}
          />
        )}
        {activeTab === 'credit-cards' && (
          <CreditCards data={data} onRefresh={fetchFinanceData} showToast={showToast} addRequest={addRequest?.page === 'credit-cards' ? addRequest.nonce : undefined} />
        )}
        {activeTab === 'goals' && (
          <EntityGrid 
            entityType="goals"
            entities={data.goals}
            addRequest={addRequest?.page === 'goals' ? addRequest.nonce : undefined}
            searchSeed={searchSeed?.page === 'goals' ? searchSeed : null}
            categories={data.categories} 
            institutions={data.institutions} 
            goals={data.goals}
            onRefresh={fetchFinanceData} 
            showToast={showToast}
          />
        )}
        {activeTab === 'simulations' && (
          <Simulations data={data} initialParams={simRedirectParams} onGo={(page) => navigateTo(page)} />
        )}
        {activeTab === 'financial-calendar' && (
          <FinancialCalendar />
        )}
        {activeTab === 'loans' && (
          <LoanPlanner data={data} showToast={showToast} />
        )}
        {activeTab === 'taxation' && (
          <Taxation data={data} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'ask-artha' && (
          <AskArtha data={data} showToast={showToast} />
        )}
        {activeTab === 'reports' && (
          <Reports data={data} />
        )}
        {activeTab === 'settings' && (
          <Settings onRefresh={fetchFinanceData} showToast={showToast} openSection={settingsSection} />
        )}
        {activeTab === 'help' && (
          <Help />
        )}
      </main>

      {paletteOpen && (
        <CommandPalette data={data} onClose={() => setPaletteOpen(false)} onCommand={(c) => { void runCommand(c); }} onNavigate={navigateTo} />
      )}

      {/* Toast Notifications container */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none'
      }}>
        {toasts.map(toast => {
          let bg = 'rgba(15, 23, 42, 0.8)';
          let border = 'rgba(148, 163, 184, 0.2)';
          let iconColor = 'var(--text-muted)';
          
          if (toast.type === 'success') {
            bg = 'rgba(16, 185, 129, 0.1)';
            border = 'rgba(16, 185, 129, 0.2)';
            iconColor = 'var(--success-light)';
          } else if (toast.type === 'error') {
            bg = 'rgba(239, 68, 68, 0.1)';
            border = 'rgba(239, 68, 68, 0.2)';
            iconColor = 'var(--danger-light)';
          } else if (toast.type === 'info') {
            bg = 'rgba(139, 92, 246, 0.1)';
            border = 'rgba(139, 92, 246, 0.2)';
            iconColor = 'var(--accent-light)';
          }

          return (
            <div 
              key={toast.id} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 18px',
                borderRadius: '10px',
                background: bg,
                backdropFilter: 'blur(16px)',
                border: `1px solid ${border}`,
                color: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                minWidth: '280px',
                maxWidth: '400px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                animation: 'slideIn 0.3s ease forwards',
                pointerEvents: 'auto'
              }}
            >
              {toast.type === 'success' && <CheckCircle2 size={16} style={{ color: iconColor, flexShrink: 0 }} />}
              {toast.type === 'error' && <AlertCircle size={16} style={{ color: iconColor, flexShrink: 0 }} />}
              {toast.type === 'info' && <Info size={16} style={{ color: iconColor, flexShrink: 0 }} />}
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'rgba(255,255,255,0.4)', 
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
        <style>{`
          @keyframes slideIn {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
};

export default App;
