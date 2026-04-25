export default function TitleBar({ title }: { title?: string }) {
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <button className="titlebar-btn titlebar-btn-left" onClick={() => window.electronAPI.openProjectSelector()} title="打开项目">📂</button>
        <span className="titlebar-title">{title || 'Claude Tool'}</span>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={() => window.electronAPI.minimizeWindow()}>─</button>
        <button className="titlebar-btn" onClick={() => window.electronAPI.maximizeWindow()}>□</button>
        <button className="titlebar-btn titlebar-btn-close" onClick={() => window.electronAPI.closeWindow()}>✕</button>
      </div>
    </div>
  );
}
