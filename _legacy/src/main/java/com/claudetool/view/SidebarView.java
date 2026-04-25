package com.claudetool.view;

import com.claudetool.viewmodel.NavigationState;
import javafx.geometry.Insets;
import javafx.scene.control.Label;
import javafx.scene.control.ListView;
import javafx.scene.layout.VBox;

public class SidebarView extends VBox {
    private final ListView<NavItem> navList;

    public SidebarView(NavigationState nav) {
        setPadding(new Insets(10));
        setSpacing(5);
        getStyleClass().add("sidebar");

        Label navTitle = new Label("导航");
        navTitle.getStyleClass().add("sidebar-title");

        navList = new ListView<>();
        navList.getItems().addAll(
                new NavItem("项目首页", NavigationState.Page.HOME),
                new NavItem("Claude Code", NavigationState.Page.CLAUDE_DASHBOARD),
                new NavItem("会话记录", NavigationState.Page.SESSIONS),
                new NavItem("任务看板", NavigationState.Page.TASKS),
                new NavItem("全局搜索", NavigationState.Page.SEARCH),
                new NavItem("设置", NavigationState.Page.SETTINGS)
        );
        navList.getStyleClass().add("nav-list");
        navList.setPrefHeight(Double.MAX_VALUE);

        navList.getSelectionModel().selectedItemProperty().addListener((obs, old, val) -> {
            if (val != null) nav.navigateTo(val.target());
        });

        nav.currentPageProperty().addListener((o, old, val) -> {
            if (val != null) selectPage(val);
        });

        navList.getSelectionModel().selectFirst();

        getChildren().addAll(navTitle, navList);
    }

    public void selectPage(NavigationState.Page page) {
        for (int i = 0; i < navList.getItems().size(); i++) {
            if (navList.getItems().get(i).target() == page) {
                navList.getSelectionModel().select(i);
                return;
            }
        }
    }

    public record NavItem(String label, NavigationState.Page target) {
        @Override public String toString() { return label; }
    }
}
