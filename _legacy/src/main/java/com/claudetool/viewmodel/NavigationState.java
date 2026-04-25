package com.claudetool.viewmodel;

import javafx.beans.property.ObjectProperty;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;

import java.util.Map;

public class NavigationState {
    public enum Page {
        HOME, PROJECT_DETAIL, CLAUDE_DASHBOARD, SESSIONS, TASKS, SEARCH, SETTINGS
    }

    private final ObjectProperty<Page> currentPage = new SimpleObjectProperty<>(Page.HOME);
    private final StringProperty currentProjectId = new SimpleStringProperty();

    public ObjectProperty<Page> currentPageProperty() { return currentPage; }
    public Page getCurrentPage() { return currentPage.get(); }
    public String getCurrentProjectId() { return currentProjectId.get(); }
    public StringProperty currentProjectIdProperty() { return currentProjectId; }

    public void navigateTo(Page page) {
        if (page != Page.PROJECT_DETAIL) currentProjectId.set(null);
        currentPage.set(page);
    }

    public void navigateToProject(String projectId) {
        currentProjectId.set(projectId);
        currentPage.set(Page.PROJECT_DETAIL);
    }

    public static Page fromLegacyRoute(String route) {
        return switch (route) {
            case "claude" -> Page.CLAUDE_DASHBOARD;
            case "projects" -> Page.HOME;
            case "sessions" -> Page.SESSIONS;
            case "tasks" -> Page.TASKS;
            case "search" -> Page.SEARCH;
            case "settings" -> Page.SETTINGS;
            default -> Page.HOME;
        };
    }

    public static final Map<Page, String> PAGE_TITLES = Map.of(
            Page.HOME, "项目首页",
            Page.PROJECT_DETAIL, "项目详情",
            Page.CLAUDE_DASHBOARD, "Claude Code",
            Page.SESSIONS, "会话记录",
            Page.TASKS, "任务看板",
            Page.SEARCH, "全局搜索",
            Page.SETTINGS, "设置"
    );
}
