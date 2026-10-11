import React, { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Filter, RefreshCw } from 'lucide-react';

import { API_BASE_URL } from '../config';

interface CalendarEvent {
  title: string;
  amount: number;
  type: 'EMI' | 'SIP' | 'Insurance' | 'Credit Card' | 'Tax';
  date: string;
  details: string;
}

export const FinancialCalendar: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/calendar`);
      if (res.ok) {
        const d = await res.json();
        setEvents(d);
      }
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const filteredEvents = events.filter(e => {
    if (filterType === 'all') return true;
    return e.type.toLowerCase() === filterType.toLowerCase();
  });

  const groupedEvents: { [key: string]: CalendarEvent[] } = {};
  filteredEvents.forEach(e => {
    const d = new Date(e.date);
    const monthYear = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!groupedEvents[monthYear]) {
      groupedEvents[monthYear] = [];
    }
    groupedEvents[monthYear].push(e);
  });

  const totalOutlay = filteredEvents.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Financial Calendar</h1>
          <p className="page-subtitle">Payments coming up in the next 12 months: EMIs, SIPs, premiums, card bills and advance tax.</p>
        </div>
        <button 
          onClick={fetchEvents}
          className="btn btn-secondary" 
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px' }}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin-anim' : ''} />
          Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Projected Outlay (12-Month Total)</span>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--text-primary)' }}>
              {formatCurrency(totalOutlay)}
            </h2>
          </div>
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-light)', padding: '12px', borderRadius: '50%' }}>
            <CalendarIcon size={24} />
          </div>
        </div>

        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />
          <div style={{ flexGrow: 1 }}>
            <label className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Filter Event Category</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['all', 'emi', 'sip', 'insurance', 'credit card', 'tax'].map(type => (
                <button
                  key={type}
                  className={`btn ${filterType === type ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: '12px', textTransform: 'capitalize' }}
                  onClick={() => setFilterType(type)}
                >
                  {type === 'all' ? 'All Events' : type === 'emi' ? 'EMIs' : type === 'sip' ? 'SIPs' : type === 'insurance' ? 'Insurance' : type === 'tax' ? 'Tax' : 'Credit Cards'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="spin-anim" style={{ width: '30px', height: '30px', border: '3px solid rgba(139, 92, 246, 0.1)', borderTop: '3px solid #8b5cf6', borderRadius: '50%' }}></div>
        </div>
      ) : Object.keys(groupedEvents).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(groupedEvents).map(([monthYear, monthEvents]) => (
            <div key={monthYear} className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent-light)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px', marginBottom: '16px' }}>
                {monthYear}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {monthEvents.map((e, idx) => {
                  const day = new Date(e.date).getDate();
                  const weekday = new Date(e.date).toLocaleDateString('default', { weekday: 'short' });
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.01)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ 
                          textAlign: 'center', 
                          minWidth: '50px', 
                          background: 'rgba(139, 92, 246, 0.05)', 
                          border: '1px solid var(--border-glass)', 
                          borderRadius: 'var(--radius-sm)',
                          padding: '6px'
                        }}>
                          <span style={{ fontSize: '16px', fontWeight: 700, display: 'block', color: 'var(--text-primary)' }}>{day}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{weekday}</span>
                        </div>
                        
                        <div>
                          <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>{e.title}</strong>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{e.details}</span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ 
                          fontSize: '10px', 
                          padding: '3px 8px', 
                          borderRadius: '20px', 
                          fontWeight: 600,
                          background: e.type === 'EMI' ? 'rgba(239, 68, 68, 0.1)' : e.type === 'SIP' ? 'rgba(16, 185, 129, 0.1)' : e.type === 'Insurance' ? 'rgba(59, 130, 246, 0.1)' : e.type === 'Tax' ? 'rgba(167, 139, 250, 0.12)' : 'rgba(245, 158, 11, 0.1)',
                          color: e.type === 'EMI' ? 'var(--danger)' : e.type === 'SIP' ? 'var(--success)' : e.type === 'Insurance' ? 'var(--info)' : e.type === 'Tax' ? 'var(--accent-light)' : 'var(--warning)'
                        }}>
                          {e.type}
                        </span>
                        <strong style={{ fontSize: '16px', color: '#ffffff' }}>
                          {formatCurrency(e.amount)}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No upcoming scheduled outlays for this category filter.
        </div>
      )}
      
      <style>{`
        .spin-anim {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
