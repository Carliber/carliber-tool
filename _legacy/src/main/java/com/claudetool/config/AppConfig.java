package com.claudetool.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class AppConfig {
    private static final Logger log = LoggerFactory.getLogger(AppConfig.class);
    private static final String CONFIG_DIR = System.getProperty("user.home") + "/.claude-tool";
    private static final String CONFIG_FILE = CONFIG_DIR + "/config.json";
    private static volatile AppConfig instance;

    private String theme = "LIGHT";
    private String dataDir = CONFIG_DIR + "/data";
    private int windowWidth = 1280;
    private int windowHeight = 800;
    private int windowX = -1;
    private int windowY = -1;
    private String lastPage = "claude";
    private String lastProjectId;
    private String claudeCliPath = "claude";

    private AppConfig() {}

    public static AppConfig getInstance() {
        if (instance == null) {
            synchronized (AppConfig.class) {
                if (instance == null) {
                    instance = loadOrCreate();
                }
            }
        }
        return instance;
    }

    private static AppConfig loadOrCreate() {
        Path path = Path.of(CONFIG_FILE);
        if (Files.exists(path)) {
            try {
                String json = Files.readString(path);
                instance = new Gson().fromJson(json, AppConfig.class);
                if (instance == null) instance = new AppConfig();
                return instance;
            } catch (IOException e) {
                log.warn("Failed to load config, using defaults", e);
            }
        }
        return new AppConfig();
    }

    public void save() {
        try {
            Path dir = Path.of(CONFIG_DIR);
            if (!Files.exists(dir)) Files.createDirectories(dir);
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            Files.writeString(Path.of(CONFIG_FILE), gson.toJson(this));
        } catch (IOException e) {
            log.error("Failed to save config", e);
        }
    }

    public String getTheme() { return theme; }
    public void setTheme(String theme) { this.theme = theme; }
    public String getDataDir() { return dataDir; }
    public void setDataDir(String dataDir) { this.dataDir = dataDir; }
    public int getWindowWidth() { return windowWidth; }
    public void setWindowWidth(int w) { this.windowWidth = w; }
    public int getWindowHeight() { return windowHeight; }
    public void setWindowHeight(int h) { this.windowHeight = h; }
    public int getWindowX() { return windowX; }
    public void setWindowX(int x) { this.windowX = x; }
    public int getWindowY() { return windowY; }
    public void setWindowY(int y) { this.windowY = y; }
    public String getLastPage() { return lastPage; }
    public void setLastPage(String page) { this.lastPage = page; }
    public String getLastProjectId() { return lastProjectId; }
    public void setLastProjectId(String id) { this.lastProjectId = id; }
    public String getClaudeCliPath() { return claudeCliPath; }
    public void setClaudeCliPath(String path) { this.claudeCliPath = path; }
}
