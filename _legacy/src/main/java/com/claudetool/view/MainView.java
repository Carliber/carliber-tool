package com.claudetool.view;

import com.claudetool.config.AppConfig;
import com.claudetool.config.ThemeManager;
import com.claudetool.storage.GsonStorage;
import com.claudetool.storage.JsonStorage;
import com.claudetool.viewmodel.NavigationState;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyCodeCombination;
import javafx.scene.input.KeyCombination;
import javafx.scene.layout.*;

import java.util.function.Consumer;

public class MainView {
    private final BorderPane root;
    private final StackPane contentArea;
    private final ThemeManager themeManager;
    private final JsonStorage storage;
    private final Label statusLabel;
    private final SidebarView sidebar;
    private final NavigationState nav;
    private Consumer<String> onTitleChanged;

    public MainView(AppConfig config, ThemeManager themeManager) {
        this.themeManager = themeManager;
        this.storage = new GsonStorage();
        this.nav = new NavigationState();
        root = new BorderPane();
        contentArea = new StackPane();
        statusLabel = new Label("就绪");

        sidebar = new SidebarView(nav);
        sidebar.prefWidthProperty().set(200);

        root.setTop(createToolbar());
        root.setLeft(sidebar);
        root.setCenter(contentArea);
        root.setBottom(createStatusBar());

        nav.currentPageProperty().addListener((o, old, val) -> renderPage());

        NavigationState.Page initial = NavigationState.fromLegacyRoute(config.getLastPage());
        nav.navigateTo(initial);
    }

    public NavigationState getNav() { return nav; }

    public void setupAccelerators(javafx.scene.Scene scene) {
        scene.getAccelerators().put(
                new KeyCodeCombination(KeyCode.F, KeyCombination.CONTROL_DOWN),
                () -> nav.navigateTo(NavigationState.Page.SEARCH));
        scene.getAccelerators().put(
                new KeyCodeCombination(KeyCode.N, KeyCombination.CONTROL_DOWN),
                () -> nav.navigateTo(NavigationState.Page.TASKS));
        scene.getAccelerators().put(
                new KeyCodeCombination(KeyCode.F1),
                () -> {
                    Alert help = new Alert(Alert.AlertType.INFORMATION);
                    help.setTitle("快捷键");
                    help.setHeaderText("Claude Tool 快捷键");
                    help.setContentText("Ctrl+F  全局搜索\nCtrl+N  新建任务\nF1      显示帮助");
                    help.show();
                });
    }

    private HBox createToolbar() {
        HBox toolbar = new HBox(10);
        toolbar.setAlignment(Pos.CENTER_LEFT);
        toolbar.setPadding(new Insets(8, 16, 8, 16));
        toolbar.getStyleClass().add("toolbar");

        Label title = new Label("Claude Tool");
        title.getStyleClass().add("toolbar-title");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button themeBtn = new Button("LIGHT".equals(themeManager.getCurrentTheme()) ? "Dark Mode" : "Light Mode");
        themeBtn.getStyleClass().add("theme-button");
        themeBtn.setTooltip(new Tooltip("切换亮色/暗色主题"));
        themeBtn.setOnAction(e -> {
            themeManager.toggleTheme();
            themeBtn.setText("LIGHT".equals(themeManager.getCurrentTheme()) ? "Dark Mode" : "Light Mode");
        });

        toolbar.getChildren().addAll(title, spacer, themeBtn);
        return toolbar;
    }

    private HBox createStatusBar() {
        HBox bar = new HBox(20);
        bar.setAlignment(Pos.CENTER_LEFT);
        bar.setPadding(new Insets(4, 16, 4, 16));
        bar.getStyleClass().add("status-bar");
        bar.getChildren().add(statusLabel);
        return bar;
    }

    public void setOnTitleChanged(Consumer<String> cb) { this.onTitleChanged = cb; }

    private void renderPage() {
        contentArea.getChildren().clear();
        NavigationState.Page page = nav.getCurrentPage();
        AppConfig.getInstance().setLastPage(page.name().toLowerCase());

        if (onTitleChanged != null) {
            String name = NavigationState.PAGE_TITLES.getOrDefault(page, "");
            onTitleChanged.accept("Claude Tool" + (name.isEmpty() ? "" : " - " + name));
        }

        switch (page) {
            case HOME -> contentArea.getChildren().add(new ProjectListView(storage, statusLabel, nav));
            case PROJECT_DETAIL -> {
                String pid = nav.getCurrentProjectId();
                if (pid != null) contentArea.getChildren().add(new ProjectDetailView(storage, pid, statusLabel, nav));
            }
            case CLAUDE_DASHBOARD -> contentArea.getChildren().add(new ClaudeDashboardView(statusLabel));
            case SESSIONS -> contentArea.getChildren().add(new SessionListView(storage, statusLabel));
            case TASKS -> contentArea.getChildren().add(new TaskBoardView(storage, statusLabel));
            case SEARCH -> contentArea.getChildren().add(new SearchView(storage, statusLabel, r -> nav.navigateTo(NavigationState.fromLegacyRoute(r))));
            case SETTINGS -> contentArea.getChildren().add(new SettingsView());
        }
    }

    public BorderPane getRoot() { return root; }
}
