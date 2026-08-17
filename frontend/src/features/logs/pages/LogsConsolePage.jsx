import React from "react";
const LogsConsolePage = ({ liveLogs, setLiveLogs, showMsg }) => {
  return (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                    Nhật ký AI & Đồng bộ (AI Logs Console)
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--on-surface-var)' }}>
                    Nhật ký chi tiết các yêu cầu kích hoạt AI Agents chấm điểm, dịch STT và đồng bộ dữ liệu.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      const txt = liveLogs.map(l => `[${l.time}] ${l.text}`).join('\n');
                      const blob = new Blob([txt], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `ai-scoring-log-${new Date().toISOString().split('T')[0]}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showMsg?.('Xuất file log thành công!', 'success');
                    }}
                    className="btn-secondary"
                    style={{ padding: '9px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                    Xuất File Log
                  </button>

                  <button
                    onClick={() => {
                      const clearedLogs = [
                        { time: new Date().toLocaleTimeString('vi-VN', { hour12: false }), text: 'Logs console cleared by administrator.' }
                      ];
                      setLiveLogs(clearedLogs);
                      try {
                        localStorage.setItem('ai_scoring_live_logs', JSON.stringify(clearedLogs));
                      } catch (e) {}
                      showMsg?.('Đã xóa trắng lịch sử log.', 'success');
                    }}
                    className="btn-secondary"
                    style={{ padding: '9px 16px', fontSize: '12px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete_sweep</span>
                    Xóa nhật ký
                  </button>
                </div>
              </div>

              {/* Log terminal box */}
              <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0b121f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fbbf24' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ fontSize: '11px', color: 'var(--on-surface-var)', fontFamily: 'Courier New, monospace', fontWeight: 'bold', marginLeft: '12px' }}>bash - logs@console</span>
                </div>

                <div id="live-log" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'Courier New, monospace', fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6 }}>
                  {liveLogs.map((log, index) => {
                    let logColor = '#cbd5e1';
                    if (log.text.includes('✅') || log.text.includes('🟢')) logColor = '#10b981';
                    else if (log.text.includes('❌') || log.text.includes('🔴')) logColor = '#ef4444';
                    else if (log.text.includes('🔄') || log.text.includes('🤖')) logColor = '#38bdf8';

                    return (
                      <div key={index} style={{ display: 'flex', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '4px' }}>
                        <span style={{ color: 'var(--primary)', fontWeight: 'bold', flexShrink: 0 }}>[{log.time}]</span>
                        <span style={{ color: logColor }}>{log.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

  );
};

export default LogsConsolePage;
