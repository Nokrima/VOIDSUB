import React from 'react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[UI] Render hatasi yakalandi:', error, errorInfo);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#05070A',
          color: '#E5E7EB',
          padding: '24px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: '760px',
            width: '100%',
            borderRadius: '16px',
            border: '1px solid rgba(248,113,113,0.28)',
            background: 'rgba(127,29,29,0.16)',
            padding: '20px 22px',
            boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
          }}
        >
          <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#FCA5A5' }}>
            UI Render Hatası
          </div>
          <div style={{ marginTop: '10px', fontSize: '20px', fontWeight: 700, color: '#FEE2E2' }}>
            Ana ekran render edilirken bir hata oluştu.
          </div>
          <pre
            style={{
              marginTop: '14px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '13px',
              lineHeight: 1.6,
              color: '#FECACA',
            }}
          >
            {this.state.error.stack ?? this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
