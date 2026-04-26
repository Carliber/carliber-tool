interface TitlebarProps {
  title: string;
  showMaximize?: boolean;
}

export default function Titlebar({ title, showMaximize = true }: TitlebarProps) {
  return (
    <div className="titlebar">
      <div className="titlebar-drag"><span className="titlebar-title">{title}</span></div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={() => window.electronAPI.minimizeWindow()} title="最小化">&#x2500;</button>
        {showMaximize && (
          <button className="titlebar-btn" onClick={() => window.electronAPI.maximizeWindow()} title="最大化">&#x25A1;</button>
        )}
        <button className="titlebar-btn titlebar-btn-close" onClick={() => window.electronAPI.closeWindow()} title="关闭">&#x2715;</button>
      </div>
    </div>
  );
}
