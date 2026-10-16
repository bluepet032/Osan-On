import { Component, type ReactNode } from 'react'

// Without this, any render error unmounts the whole app and leaves a blank page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main id="main-content" className="container">
        <div className="message error" role="alert">
          <strong>문제가 생겼습니다</strong>
          <span>페이지를 새로고침해 주세요. 계속되면 잠시 후 다시 시도해 주세요.</span>
          <button type="button" className="text-button" onClick={() => window.location.reload()}>새로고침</button>
        </div>
      </main>
    )
  }
}
