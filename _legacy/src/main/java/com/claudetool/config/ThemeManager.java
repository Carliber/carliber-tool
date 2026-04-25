package com.claudetool.config;

import javafx.scene.Scene;

public class ThemeManager {
    private static volatile ThemeManager instance;
    private String currentTheme = "LIGHT";
    private Scene scene;

    private ThemeManager() {}

    public static ThemeManager getInstance() {
        if (instance == null) {
            synchronized (ThemeManager.class) {
                if (instance == null) instance = new ThemeManager();
            }
        }
        return instance;
    }

    public void setScene(Scene scene) { this.scene = scene; }

    public void toggleTheme() {
        currentTheme = "LIGHT".equals(currentTheme) ? "DARK" : "LIGHT";
        applyTheme();
        AppConfig.getInstance().setTheme(currentTheme);
        AppConfig.getInstance().save();
    }

    public void applyTheme() {
        if (scene == null) return;
        scene.getStylesheets().clear();
        scene.getStylesheets().add(getClass().getResource("/css/" + getThemeCss()).toExternalForm());
    }

    public String getThemeCss() {
        return "LIGHT".equals(currentTheme) ? "light-theme.css" : "dark-theme.css";
    }

    public String getCurrentTheme() { return currentTheme; }

    public void initFromConfig() {
        currentTheme = AppConfig.getInstance().getTheme();
    }
}
