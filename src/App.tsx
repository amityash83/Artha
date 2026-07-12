import React, { useEffect, useState } from 'react';
import { 
  Landmark, LandmarkIcon, PiggyBank, 
  Target, FileText, Database, Compass, Calendar, Calculator, Zap, LineChart, ArrowRightLeft
} from 'lucide-react';
import { InitData } from './types';
import { Dashboard } from './components/Dashboard';
import { EntityGrid } from './components/EntityGrid';
import { Snapshot } from './components/Snapshot';
import { Simulations } from './components/Simulations';
import { Reports } from './components/Reports';
import { EmiCalculator } from './components/EmiCalculator';
import { FinancialCalendar } from './components/FinancialCalendar';
import { LoanOptimizer } from './components/LoanOptimizer';
import { CashFlowPlanning } from './components/CashFlowPlanning';
import { TransactionsLedger } from './components/TransactionsLedger';
import { API_BASE_URL } from './config';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing Financial OS...');
  const [data, setData] = useState<InitData | null>(null);
  
  // Cache scenario arguments for simulation redirect
  const [simRedirectParams, setSimRedirectParams] = useState<any>(null);

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
          <Compass size={22} style={{ color: '#a78bfa' }} />
          <span className="logo-text">Artha</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <ul className="sidebar-menu">
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => handleNavigate('dashboard')}
              >
                <Compass size={16} />
                Dashboard
              </div>
            </li>
             <li>
              <div 
                className={`sidebar-item ${activeTab === 'snapshot' ? 'active' : ''}`}
                onClick={() => handleNavigate('snapshot')}
              >
                <Calendar size={16} />
                Monthly Snapshot
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'cash-flow' ? 'active' : ''}`}
                onClick={() => handleNavigate('cash-flow')}
              >
                <LineChart size={16} />
                Cash Flow Planning
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'transactions' ? 'active' : ''}`}
                onClick={() => handleNavigate('transactions')}
              >
                <ArrowRightLeft size={16} />
                Transactions Ledger
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'financial-calendar' ? 'active' : ''}`}
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
                onClick={() => handleNavigate('accounts')}
              >
                <Landmark size={16} />
                Accounts
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'assets' ? 'active' : ''}`}
                onClick={() => handleNavigate('assets')}
              >
                <PiggyBank size={16} />
                Assets
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'liabilities' ? 'active' : ''}`}
                onClick={() => handleNavigate('liabilities')}
              >
                <LandmarkIcon size={16} />
                Liabilities
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'goals' ? 'active' : ''}`}
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
                onClick={() => handleNavigate('simulations')}
              >
                <LineChart size={16} />
                Simulations
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'emi-calculator' ? 'active' : ''}`}
                onClick={() => handleNavigate('emi-calculator')}
              >
                <Calculator size={16} />
                EMI Tool
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'loan-optimizer' ? 'active' : ''}`}
                onClick={() => handleNavigate('loan-optimizer')}
              >
                <Zap size={16} style={{ color: 'var(--accent-light)' }} />
                Loan Optimizer
              </div>
            </li>
            <li>
              <div 
                className={`sidebar-item ${activeTab === 'reports' ? 'active' : ''}`}
                onClick={() => handleNavigate('reports')}
              >
                <FileText size={16} />
                Integrations &amp; Backups
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
          <Snapshot data={data} onRefresh={fetchFinanceData} />
        )}
        {activeTab === 'cash-flow' && (
          <CashFlowPlanning data={data} onRefresh={fetchFinanceData} />
        )}
        {activeTab === 'transactions' && (
          <TransactionsLedger data={data} onRefresh={fetchFinanceData} />
        )}
        {activeTab === 'accounts' && (
          <EntityGrid 
            entityType="accounts" 
            entities={data.accounts} 
            categories={data.categories} 
            institutions={data.institutions} 
            onRefresh={fetchFinanceData} 
          />
        )}
        {activeTab === 'assets' && (
          <EntityGrid 
            entityType="assets" 
            entities={data.assets} 
            categories={data.categories} 
            institutions={data.institutions} 
            onRefresh={fetchFinanceData} 
          />
        )}
        {activeTab === 'liabilities' && (
          <EntityGrid 
            entityType="liabilities" 
            entities={data.liabilities} 
            categories={data.categories} 
            institutions={data.institutions} 
            onRefresh={fetchFinanceData} 
          />
        )}
        {activeTab === 'goals' && (
          <EntityGrid 
            entityType="goals" 
            entities={data.goals} 
            categories={data.categories} 
            institutions={data.institutions} 
            onRefresh={fetchFinanceData} 
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
          <EmiCalculator />
        )}
        {activeTab === 'reports' && (
          <Reports data={data} onRefresh={fetchFinanceData} />
        )}
      </main>
    </div>
  );
};

export default App;
