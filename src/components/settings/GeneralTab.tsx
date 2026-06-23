import { useState, useCallback } from 'react';
import { detectOmpCli, exportBackup, importBackup } from '../../utils/storage';
import { scanAndMergeProjects } from '../../utils/project-scan';
import type { AppConfig } from '../../types/api';

export default function GeneralTab({ settings, handleChange, cliStatus, onDetect }: {
  settings: AppConfig; handleChange: (k: string, v: string | number) => void;
  cliStatus: string; onDetect: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState('');

  const handleScanOmpSessions = useCallback(async () => {
    setScanning(true);
    setScanResult('');
    try {
      const { newCount, updatedCount } = await scanAndMergeProjects();
      setScanResult(`新增 ${newCount} 个，更新 ${updatedCount} 个`);
    } catch (e) {
      setScanResult(`扫描失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    setScanning(false);
  }, []);

  return (
    <div className="settings-section">
      <div className="form-group">
        <label>主题</label>
        <select value={settings.theme} onChange={e => handleChange('theme', e.target.value)}>
          <option value="light">亮色</option>
          <option value="dark">暗色</option>
        </select>
      </div>
      <div className="form-group">
        <label>omp CLI 路径</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={settings.ompCliPath || ''} onChange={e => handleChange('ompCliPath', e.target.value)}
            placeholder="omp" style={{ flex: 1 }} />
          <button className="primary" onClick={onDetect}>自动检测</button>
        </div>
        {cliStatus && <div className="form-hint">{cliStatus}</div>}
      </div>
      <div className="separator" />
      <h3 className="title-sm">字号设置</h3>
      <div className="form-group">
        <label>界面字号</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={11} max={20} value={settings.uiFontSize || 14}
            onChange={e => handleChange('uiFontSize', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span className="text-sm" style={{ minWidth: 36 }}>{settings.uiFontSize || 14}px</span>
        </div>
      </div>
      <div className="form-group">
        <label>编辑器字号</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={10} max={24} value={settings.editorFontSize || 13}
            onChange={e => handleChange('editorFontSize', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span className="text-sm" style={{ minWidth: 36 }}>{settings.editorFontSize || 13}px</span>
        </div>
      </div>
      <div className="form-group">
        <label>终端字号</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={10} max={24} value={settings.terminalFontSize || 14}
            onChange={e => handleChange('terminalFontSize', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span className="text-sm" style={{ minWidth: 36 }}>{settings.terminalFontSize || 14}px</span>
        </div>
      </div>
      <div className="form-group">
        <label>文件树字号</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={10} max={18} value={settings.treeFontSize || 13}
            onChange={e => handleChange('treeFontSize', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span className="text-sm" style={{ minWidth: 36 }}>{settings.treeFontSize || 13}px</span>
        </div>
      </div>
      <div className="separator" />
      <h3 className="title-sm">项目管理</h3>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button className="primary" onClick={handleScanOmpSessions} disabled={scanning}>
          {scanning ? '扫描中...' : '扫描 omp 会话'}
        </button>
        {scanResult && <span className="text-sm text-muted">{scanResult}</span>}
      </div>
      <div className="separator" />
      <h3 className="title-sm">数据备份</h3>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={async () => { const ok = await exportBackup(); alert(ok ? '已导出' : '取消'); }}>导出备份</button>
        <button onClick={async () => { if (!confirm('覆盖当前数据？')) return; const ok = await importBackup(); alert(ok ? '已恢复' : '取消'); }}>导入恢复</button>
      </div>
      <div className="separator" />
      <p className="text-muted text-sm">carliber-tool v3.0.0</p>
    </div>
  );
}
