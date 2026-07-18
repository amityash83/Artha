import React, { useEffect, useState } from 'react';
import {
  Landmark, LandmarkIcon, PiggyBank,
  Target, FileText, Database, Compass, Calendar, Calculator, Zap, LineChart, ArrowRightLeft, Sliders,
  CheckCircle2, AlertCircle, Info, X, CreditCard, Percent, Sparkles, HelpCircle
} from 'lucide-react';
import { InitData } from './types';
import { Dashboard } from './components/Dashboard';
import { EntityGrid } from './components/EntityGrid';
import { Snapshot } from './components/Snapshot';
import { Simulations } from './components/Simulations';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import { EmiCalculator } from './components/EmiCalculator';
import { FinancialCalendar } from './components/FinancialCalendar';
import { LoanOptimizer } from './components/LoanOptimizer';
import { CashFlowPlanning } from './components/CashFlowPlanning';
import { TransactionsLedger } from './components/TransactionsLedger';
import { BudgetPlanner } from './components/BudgetPlanner';
import { CreditCards } from './components/CreditCards';
import { Taxation } from './components/Taxation';
import { AskArtha } from './components/AskArtha';
import { Help } from './components/Help';
import { ArthaMark } from './components/branding/ArthaMark';
import { useBranding } from './components/branding/useBranding';
import { API_BASE_URL } from './config';

const App: React.FC = () => {
  const { variant: brandVariant, accentColor: brandAccent } = useBranding();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing Financial OS...');
  const [data, setData] = useState<InitData | null>(null);
  
  // Cache scenario arguments for simulation redirect
  const [simRedirectParams, setSimRedirectParams] = useState<any>(null);

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
    setActiveTab(tab);
  };

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

        <nav style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <ul className="sidebar-menu">
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                aria-current={activeTab === 'dashboard' ? 'page' : undefined}
                onClick={() => handleNavigate('dashboard')}
              >
                <Compass size={16} />
                Dashboard
              </div>
            </li>
             <li>
              <div 
                className={`sidebar-item ${activeTab === 'snapshot' ? 'active' : ''}`}
                aria-current={activeTab === 'snapshot' ? 'page' : undefined}
                onClick={() => handleNavigate('snapshot')}
              >
                <Calendar size={16} />
                Monthly Snapshot
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'cash-flow' ? 'active' : ''}`}
                aria-current={activeTab === 'cash-flow' ? 'page' : undefined}
                onClick={() => handleNavigate('cash-flow')}
              >
                <LineChart size={16} />
                Cash Flow Planning
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'transactions' ? 'active' : ''}`}
                aria-current={activeTab === 'transactions' ? 'page' : undefined}
                onClick={() => handleNavigate('transactions')}
              >
                <ArrowRightLeft size={16} />
                Transactions Ledger
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'budget-planner' ? 'active' : ''}`}
                aria-current={activeTab === 'budget-planner' ? 'page' : undefined}
                onClick={() => handleNavigate('budget-planner')}
              >
                <Sliders size={16} />
                Budget Planner
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'financial-calendar' ? 'active' : ''}`}
                aria-current={activeTab === 'financial-calendar' ? 'page' : undefined}
                onClick={() => handleNavigate('financial-calendar')}
              >
                <Calendar size={16} style={{ opacity: 0.8 }} />
                Financial Calendar
              </div>
            </li>
            
            <div style={{ height: '1px', background: 'var(--border-glass)', margin: '12px 8px' }}></div>
            
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'accounts' ? 'active' : ''}`}
                aria-current={activeTab === 'accounts' ? 'page' : undefined}
                onClick={() => handleNavigate('accounts')}
              >
                <Landmark size={16} />
                Accounts
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'assets' ? 'active' : ''}`}
                aria-current={activeTab === 'assets' ? 'page' : undefined}
                onClick={() => handleNavigate('assets')}
              >
                <PiggyBank size={16} />
                Assets
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'liabilities' ? 'active' : ''}`}
                aria-current={activeTab === 'liabilities' ? 'page' : undefined}
                onClick={() => handleNavigate('liabilities')}
              >
                <LandmarkIcon size={16} />
                Liabilities
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'credit-cards' ? 'active' : ''}`}
                aria-current={activeTab === 'credit-cards' ? 'page' : undefined}
                onClick={() => handleNavigate('credit-cards')}
              >
                <CreditCard size={16} />
                Credit Cards
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'goals' ? 'active' : ''}`}
                aria-current={activeTab === 'goals' ? 'page' : undefined}
                onClick={() => handleNavigate('goals')}
              >
                <Target size={16} />
                Goals
              </div>
            </li>

            <div style={{ height: '1px', background: 'var(--border-glass)', margin: '12px 8px' }}></div>

            <li>
              <div 
                className={`sidebar-item ${activeTab === 'simulations' ? 'active' : ''}`}
                aria-current={activeTab === 'simulations' ? 'page' : undefined}
                onClick={() => handleNavigate('simulations')}
              >
                <LineChart size={16} />
                Simulations
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'emi-calculator' ? 'active' : ''}`}
                aria-current={activeTab === 'emi-calculator' ? 'page' : undefined}
                onClick={() => handleNavigate('emi-calculator')}
              >
                <Calculator size={16} />
                EMI Tool
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'loan-optimizer' ? 'active' : ''}`}
                aria-current={activeTab === 'loan-optimizer' ? 'page' : undefined}
                onClick={() => handleNavigate('loan-optimizer')}
              >
                <Zap size={16} style={{ color: 'var(--accent-light)' }} />
                Loan Optimizer
              </div>
            </li>
            <li>
              <div
                className={`sidebar-item ${activeTab === 'taxation' ? 'active' : ''}`}
                aria-current={activeTab === 'taxation' ? 'page' : undefined}
                onClick={() => handleNavigate('taxation')}
              >
                <Percent size={16} />
                Taxation
              </div>
            </li>
            <li>
              <div
                className={`sidebar-item ${activeTab === 'ask-artha' ? 'active' : ''}`}
                aria-current={activeTab === 'ask-artha' ? 'page' : undefined}
                onClick={() => handleNavigate('ask-artha')}
              >
                <Sparkles size={16} style={{ color: 'var(--accent-light)' }} />
                Ask Artha
              </div>
            </li>
            <li>
              <div
                className={`sidebar-item ${activeTab === 'reports' ? 'active' : ''}`}
                aria-current={activeTab === 'reports' ? 'page' : undefined}
                onClick={() => handleNavigate('reports')}
              >
                <FileText size={16} />
                Reports
              </div>
            </li>
            <li>
              <div
                className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
                aria-current={activeTab === 'settings' ? 'page' : undefined}
                onClick={() => handleNavigate('settings')}
              >
                <Sliders size={16} />
                Settings
              </div>
            </li>
            <li>
              <div
                className={`sidebar-item ${activeTab === 'help' ? 'active' : ''}`}
                aria-current={activeTab === 'help' ? 'page' : undefined}
                onClick={() => handleNavigate('help')}
              >
                <HelpCircle size={16} />
                Help
              </div>
            </li>
          </ul>

          <div style={{ padding: '8px', borderTop: '1px solid var(--border-glass)', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
               <Database size={10} />
               <span>v2.0.0 (Metadata Driven OS)</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content Render */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard data={data} onNavigate={handleNavigate} />
        )}
        {activeTab === 'snapshot' && (
          <Snapshot data={data} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'cash-flow' && (
          <CashFlowPlanning data={data} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'transactions' && (
          <TransactionsLedger data={data} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'budget-planner' && (
          <BudgetPlanner data={data} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'accounts' && (
          <EntityGrid
            entityType="accounts"
            entities={data.accounts}
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
            categories={data.categories}
            institutions={data.institutions}
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
            categories={data.categories}
            institutions={data.institutions}
            goals={data.goals}
            liabilities={data.liabilities}
            properties={data.assets.filter((a) => a.category_name === 'Property')}
            onRefresh={fetchFinanceData}
            showToast={showToast}
          />
        )}
        {activeTab === 'credit-cards' && (
          <CreditCards data={data} onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'goals' && (
          <EntityGrid 
            entityType="goals" 
            entities={data.goals} 
            categories={data.categories} 
            institutions={data.institutions} 
            goals={data.goals}
            onRefresh={fetchFinanceData} 
            showToast={showToast}
          />
        )}
        {activeTab === 'simulations' && (
          <Simulations data={data} initialParams={simRedirectParams} />
        )}
        {activeTab === 'financial-calendar' && (
          <FinancialCalendar />
        )}
        {activeTab === 'loan-optimizer' && (
          <LoanOptimizer data={data} />
        )}
        {activeTab === 'emi-calculator' && (
          <EmiCalculator showToast={showToast} />
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
          <Settings onRefresh={fetchFinanceData} showToast={showToast} />
        )}
        {activeTab === 'help' && (
          <Help />
        )}
      </main>

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
