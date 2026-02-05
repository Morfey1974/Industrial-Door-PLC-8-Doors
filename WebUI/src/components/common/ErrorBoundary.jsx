/**
 * Error Boundary — перехват ошибок рендера и отображение сообщения
 */

import { Component } from 'react';
import { LanguageContext } from '../../context/LanguageContext';

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <LanguageContext.Consumer>
          {({ t }) => (
        <div style={{
          padding: '24px',
          fontFamily: 'Arial, sans-serif',
          maxWidth: '600px',
          margin: '20px auto',
          background: '#fff',
          border: '1px solid #d32f2f',
          borderRadius: '8px',
          color: '#333',
        }}>
          <h2 style={{ color: '#d32f2f', marginTop: 0 }}>{t ? t('errors.pageError') : 'Ошибка на странице'}</h2>
          <pre style={{
            background: '#f5f5f5',
            padding: '12px',
            overflow: 'auto',
            fontSize: '12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              cursor: 'pointer',
              background: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            Закрыть
          </button>
        </div>
          )}
        </LanguageContext.Consumer>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
