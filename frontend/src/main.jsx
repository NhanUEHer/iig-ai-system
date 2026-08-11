import React, { Component } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import './styles/typography.css';
import './styles/design-system.css';
import './services/authSession';

// The admin workspace currently supports one visual theme only. Apply it
// before React mounts so a saved browser preference cannot cause a dark flash.
document.documentElement.classList.add('light-theme');
localStorage.setItem('theme', 'light');

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      hasError: true,
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#fef2f2', color: '#991b1b', fontFamily: 'monospace', borderRadius: '12px', border: '1px solid #fee2e2', margin: '40px' }}>
          <h2 style={{ marginTop: 0 }}>Hệ thống gặp lỗi Runtime React</h2>
          <p>Dưới đây là chi tiết lỗi để Antigravity xử lý:</p>
          <pre style={{ background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #fca5a5', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            {"\n\nComponent Stack:\n"}
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button 
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: '16px', padding: '10px 20px', background: '#991b1b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Clear LocalStorage & Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
