package com.claudetool.tray;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;

public class SystemTrayManager {
    private TrayIcon trayIcon;
    private Runnable onShow;
    private Runnable onExit;

    public void setOnShow(Runnable r) { this.onShow = r; }
    public void setOnExit(Runnable r) { this.onExit = r; }

    public boolean isSupported() {
        return SystemTray.isSupported();
    }

    public void install() {
        if (!isSupported()) return;
        SystemTray tray = SystemTray.getSystemTray();

        Image image = createIcon();
        PopupMenu menu = new PopupMenu();

        MenuItem showItem = new MenuItem("显示主窗口");
        showItem.addActionListener(e -> { if (onShow != null) onShow.run(); });
        MenuItem exitItem = new MenuItem("退出");
        exitItem.addActionListener(e -> { if (onExit != null) onExit.run(); });

        menu.add(showItem);
        menu.addSeparator();
        menu.add(exitItem);

        trayIcon = new TrayIcon(image, "Claude Tool", menu);
        trayIcon.setImageAutoSize(true);
        trayIcon.addActionListener(e -> { if (onShow != null) onShow.run(); });

        try {
            tray.add(trayIcon);
        } catch (AWTException e) {
            // tray not available, ignore
        }
    }

    public void remove() {
        if (trayIcon != null) {
            SystemTray.getSystemTray().remove(trayIcon);
            trayIcon = null;
        }
    }

    private Image createIcon() {
        try {
            var url = getClass().getResource("/icons/tray.png");
            if (url != null) return ImageIO.read(url);
        } catch (Exception ignored) {}
        BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(74, 144, 217));
        g.fillRect(0, 0, 16, 16);
        g.setColor(Color.WHITE);
        g.setFont(new Font("SansSerif", Font.BOLD, 12));
        g.drawString("C", 3, 13);
        g.dispose();
        return img;
    }
}
