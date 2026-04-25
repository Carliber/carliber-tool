package com.claudetool.view;

import com.claudetool.claude.ClaudeDataService;
import com.claudetool.claude.ClaudeDataService.*;
import com.claudetool.claude.ClaudeDataService.ChatMessage;
import com.claudetool.util.DesktopUtil;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;
import javafx.util.StringConverter;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

public class ClaudeDashboardView extends VBox {
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd HH:mm");
    private final ClaudeDataService service = new ClaudeDataService();

    public ClaudeDashboardView(Label statusLabel) {
        setSpacing(10);
        setPadding(new Insets(15));

        if (!service.isClaudeAvailable()) {
            getChildren().add(new Label("Claude Code not found at " + service.getClaudeDir()));
            return;
        }

        TabPane tabPane = new TabPane();
        tabPane.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        tabPane.getTabs().addAll(createOverviewTab(), createProjectsTab(), createSessionsTab(), createConfigTab());
        VBox.setVgrow(tabPane, Priority.ALWAYS);
        getChildren().add(tabPane);
        statusLabel.setText("Claude Code connected");
    }

    private Tab createOverviewTab() {
        VBox content = new VBox(15);
        content.setPadding(new Insets(15));
        ClaudeStats stats = service.getStats();

        Label title = new Label("Usage Stats");
        title.getStyleClass().add("title-md");

        GridPane grid = new GridPane();
        grid.setHgap(20);
        grid.setVgap(10);
        grid.add(makeStatCard("Total Sessions", String.valueOf(stats.totalSessions())), 0, 0);
        grid.add(makeStatCard("Total Messages", String.valueOf(stats.totalMessages())), 1, 0);
        grid.add(makeStatCard("Models", String.valueOf(stats.modelUsage().size())), 2, 0);
        double totalCost = stats.modelUsage().values().stream().mapToDouble(ModelUsage::costUSD).sum();
        grid.add(makeStatCard("Total Cost", String.format("$%.4f", totalCost)), 3, 0);
        content.getChildren().addAll(title, grid);

        if (!stats.modelUsage().isEmpty()) {
            Label modelTitle = new Label("Model Usage");
            modelTitle.getStyleClass().add("title-sm");
            content.getChildren().add(modelTitle);

            TableView<ModelUsage> table = new TableView<>();
            table.setItems(FXCollections.observableArrayList(stats.modelUsage().values().stream().toList()));
            TableColumn<ModelUsage, String> modelCol = new TableColumn<>("Model");
            modelCol.setCellValueFactory(d -> {
                String key = stats.modelUsage().entrySet().stream()
                        .filter(e -> e.getValue().equals(d.getValue())).map(Map.Entry::getKey).findFirst().orElse("");
                return new SimpleStringProperty(key);
            });
            TableColumn<ModelUsage, String> inCol = new TableColumn<>("Input Tokens");
            inCol.setCellValueFactory(d -> new SimpleStringProperty(fmtNum(d.getValue().inputTokens())));
            TableColumn<ModelUsage, String> outCol = new TableColumn<>("Output Tokens");
            outCol.setCellValueFactory(d -> new SimpleStringProperty(fmtNum(d.getValue().outputTokens())));
            TableColumn<ModelUsage, String> costCol = new TableColumn<>("Cost");
            costCol.setCellValueFactory(d -> new SimpleStringProperty(String.format("$%.4f", d.getValue().costUSD())));
            table.getColumns().addAll(modelCol, inCol, outCol, costCol);
            VBox.setVgrow(table, Priority.ALWAYS);
            content.getChildren().add(table);
        }

        List<ActiveSession> active = service.getActiveSessions();
        if (!active.isEmpty()) {
            Label activeTitle = new Label("Active Sessions (" + active.size() + ")");
            activeTitle.getStyleClass().add("title-sm");
            content.getChildren().add(activeTitle);
            for (ActiveSession s : active) {
                String time = LocalDateTime.ofInstant(Instant.ofEpochMilli(s.startedAt()), ZoneId.systemDefault()).format(FMT);
                content.getChildren().add(new Label("PID " + s.pid() + " | " + s.cwd() + " | " + time + " | " + s.version()));
            }
        }

        List<DailyActivity> daily = stats.dailyActivity();
        if (!daily.isEmpty()) {
            Label dailyTitle = new Label("Daily Activity (last " + daily.size() + " days)");
            dailyTitle.getStyleClass().add("title-sm");
            content.getChildren().add(dailyTitle);
            TableView<DailyActivity> dailyTable = new TableView<>(FXCollections.observableArrayList(daily));
            TableColumn<DailyActivity, String> dateCol = new TableColumn<>("Date");
            dateCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().date()));
            dateCol.setPrefWidth(100);
            TableColumn<DailyActivity, String> msgCol = new TableColumn<>("Messages");
            msgCol.setCellValueFactory(d -> new SimpleStringProperty(String.valueOf(d.getValue().messageCount())));
            TableColumn<DailyActivity, String> sessCol = new TableColumn<>("Sessions");
            sessCol.setCellValueFactory(d -> new SimpleStringProperty(String.valueOf(d.getValue().sessionCount())));
            TableColumn<DailyActivity, String> toolCol = new TableColumn<>("Tool Calls");
            toolCol.setCellValueFactory(d -> new SimpleStringProperty(String.valueOf(d.getValue().toolCallCount())));
            dailyTable.getColumns().addAll(dateCol, msgCol, sessCol, toolCol);
            dailyTable.setPrefHeight(Math.min(daily.size() * 30 + 30, 200));
            content.getChildren().add(dailyTable);
        }

        return new Tab("Overview", new ScrollPane(content));
    }

    private Tab createProjectsTab() {
        VBox content = new VBox(10);
        content.setPadding(new Insets(15));
        Label title = new Label("Claude Code Projects");
        title.getStyleClass().add("title-md");

        ComboBox<ClaudeProject> projectCombo = new ComboBox<>();
        projectCombo.getItems().addAll(service.discoverProjects());
        projectCombo.setConverter(new StringConverter<>() {
            @Override public String toString(ClaudeProject p) { return p == null ? "" : (p.projectPath().isEmpty() ? p.dirName() : p.projectPath()) + " (" + p.sessionCount() + ")"; }
            @Override public ClaudeProject fromString(String s) { return null; }
        });

        ListView<ClaudeSession> sessionList = new ListView<>();
        sessionList.setPlaceholder(new Label("选择项目查看会话"));
        TextField sessionSearch = new TextField();
        sessionSearch.setPromptText("搜索会话...");
        sessionSearch.setPrefWidth(200);

        javafx.collections.ObservableList<ClaudeSession> allSessions = FXCollections.observableArrayList();
        sessionList.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(ClaudeSession s, boolean empty) {
                super.updateItem(s, empty);
                if (empty || s == null) { setText(null); setGraphic(null); return; }
                VBox box = new VBox(3);
                String prompt = s.firstPrompt().length() > 100 ? s.firstPrompt().substring(0, 100) + "..." : s.firstPrompt();
                Label head = new Label(s.messageCount() + " msgs" + (s.gitBranch().isEmpty() ? "" : " | " + s.gitBranch()));
                head.getStyleClass().add("text-bold");
                Label body = new Label(prompt);
                body.getStyleClass().add("text-sm");
                String time = s.modified().length() > 16 ? s.modified().substring(0, 16) : s.modified();
                Label meta = new Label(time);
                meta.getStyleClass().add("text-xs");
                box.getChildren().addAll(head, body, meta);
                setGraphic(box);
            }
        });

        Button launchBtn = new Button("Launch Claude CLI");
        launchBtn.setOnAction(e -> {
            ClaudeProject p = projectCombo.getValue();
            if (p != null && !p.projectPath().isEmpty()) {
                DesktopUtil.openTerminal(p.projectPath());
            }
        });

        projectCombo.valueProperty().addListener((o, old, val) -> {
            allSessions.clear();
            if (val != null) allSessions.addAll(service.getProjectSessions(val.dirName()));
            applySessionFilter(sessionSearch.getText(), allSessions, sessionList);
        });
        sessionSearch.textProperty().addListener((o, old, val) -> applySessionFilter(val, allSessions, sessionList));
        if (!projectCombo.getItems().isEmpty()) projectCombo.getSelectionModel().selectFirst();

        HBox toolbar = new HBox(10, projectCombo, sessionSearch, launchBtn);
        toolbar.setAlignment(Pos.CENTER_LEFT);
        VBox.setVgrow(sessionList, Priority.ALWAYS);
        content.getChildren().addAll(title, toolbar, sessionList);
        return new Tab("Projects", content);
    }

    private Tab createSessionsTab() {
        VBox content = new VBox(10);
        content.setPadding(new Insets(15));
        Label title = new Label("Session Details");
        title.getStyleClass().add("title-md");

        ComboBox<ClaudeProject> projectCombo = new ComboBox<>();
        projectCombo.getItems().addAll(service.discoverProjects());
        projectCombo.setConverter(new StringConverter<>() {
            @Override public String toString(ClaudeProject p) { return p == null ? "" : (p.projectPath().isEmpty() ? p.dirName() : p.projectPath()) + " (" + p.sessionCount() + ")"; }
            @Override public ClaudeProject fromString(String s) { return null; }
        });

        TableView<ClaudeSession> table = new TableView<>();
        table.setPlaceholder(new Label("选择项目查看会话"));
        TableColumn<ClaudeSession, String> dateCol = new TableColumn<>("Date");
        dateCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().created().length() > 10 ? d.getValue().created().substring(0, 10) : d.getValue().created()));
        dateCol.setPrefWidth(100);
        TableColumn<ClaudeSession, String> promptCol = new TableColumn<>("First Prompt");
        promptCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().firstPrompt()));
        promptCol.setPrefWidth(300);
        TableColumn<ClaudeSession, String> branchCol = new TableColumn<>("Branch");
        branchCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().gitBranch()));
        branchCol.setPrefWidth(120);
        TableColumn<ClaudeSession, String> msgsCol = new TableColumn<>("Msgs");
        msgsCol.setCellValueFactory(d -> new SimpleStringProperty(String.valueOf(d.getValue().messageCount())));
        msgsCol.setPrefWidth(60);
        TableColumn<ClaudeSession, String> summaryCol = new TableColumn<>("Summary");
        summaryCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().summary()));
        summaryCol.setPrefWidth(400);
        table.getColumns().addAll(dateCol, promptCol, branchCol, msgsCol, summaryCol);

        projectCombo.valueProperty().addListener((o, old, val) -> {
            table.getItems().clear();
            if (val != null) table.getItems().addAll(service.getProjectSessions(val.dirName()));
        });
        if (!projectCombo.getItems().isEmpty()) projectCombo.getSelectionModel().selectFirst();

        table.setRowFactory(tv -> {
            TableRow<ClaudeSession> row = new TableRow<>();
            row.setOnMouseClicked(e -> {
                if (e.getClickCount() == 2 && !row.isEmpty()) {
                    ClaudeSession s = row.getItem();
                    ClaudeProject p = projectCombo.getValue();
                    if (p != null && s != null) showConversation(p.dirName(), s.sessionId());
                }
            });
            return row;
        });

        VBox.setVgrow(table, Priority.ALWAYS);
        content.getChildren().addAll(title, projectCombo, table);
        return new Tab("Sessions", content);
    }

    private Tab createConfigTab() {
        TabPane configTabs = new TabPane();
        configTabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);

        Tab claudeMdTab = new Tab("CLAUDE.md");
        TextArea mdEditor = new TextArea(service.getGlobalClaudeMd());
        Button saveMd = new Button("Save");
        saveMd.setOnAction(e -> { service.saveGlobalClaudeMd(mdEditor.getText()); new Alert(Alert.AlertType.INFORMATION, "Saved.").show(); });
        VBox mdBox = new VBox(10, mdEditor, saveMd);
        VBox.setVgrow(mdEditor, Priority.ALWAYS);
        claudeMdTab.setContent(mdBox);

        Tab settingsTab = new Tab("settings.json");
        TextArea settingsEditor = new TextArea(new GsonBuilder().setPrettyPrinting().create().toJson(service.getSettings()));
        Button saveSettings = new Button("Save");
        saveSettings.setOnAction(e -> {
            try {
                JsonObject obj = new Gson().fromJson(settingsEditor.getText(), JsonObject.class);
                service.saveSettings(obj);
                new Alert(Alert.AlertType.INFORMATION, "Saved.").show();
            } catch (Exception ex) { new Alert(Alert.AlertType.ERROR, "Invalid JSON: " + ex.getMessage()).show(); }
        });
        VBox settingsBox = new VBox(10, settingsEditor, saveSettings);
        VBox.setVgrow(settingsEditor, Priority.ALWAYS);
        settingsTab.setContent(settingsBox);

        Tab rulesTab = new Tab("Rules");
        ListView<String> rulesList = new ListView<>(FXCollections.observableArrayList(service.listRules()));
        TextArea ruleView = new TextArea();
        rulesList.getSelectionModel().selectedItemProperty().addListener((o, old, val) -> { if (val != null) ruleView.setText(service.readRule(val)); });
        SplitPane rulesSplit = new SplitPane(rulesList, ruleView);
        rulesTab.setContent(rulesSplit);

        Tab plansTab = new Tab("Plans");
        ListView<String> plansList = new ListView<>(FXCollections.observableArrayList(service.listPlans()));
        TextArea planView = new TextArea();
        plansList.getSelectionModel().selectedItemProperty().addListener((o, old, val) -> { if (val != null) planView.setText(service.readPlan(val)); });
        SplitPane plansSplit = new SplitPane(plansList, planView);
        plansTab.setContent(plansSplit);

        configTabs.getTabs().addAll(claudeMdTab, settingsTab, rulesTab, plansTab);
        return new Tab("Config", configTabs);
    }

    private VBox makeStatCard(String label, String value) {
        VBox card = new VBox(5);
        card.getStyleClass().add("stat-card");
        Label v = new Label(value);
        v.getStyleClass().add("stat-value");
        Label l = new Label(label);
        l.getStyleClass().add("stat-label");
        card.getChildren().addAll(v, l);
        return card;
    }

    private void applySessionFilter(String query, javafx.collections.ObservableList<ClaudeSession> all, ListView<ClaudeSession> list) {
        if (query == null || query.isBlank()) {
            list.setItems(all);
        } else {
            String q = query.toLowerCase();
            list.setItems(all.filtered(s ->
                    s.firstPrompt().toLowerCase().contains(q) || s.summary().toLowerCase().contains(q) || s.gitBranch().toLowerCase().contains(q)));
        }
    }

    private String fmtNum(long n) {
        if (n >= 1_000_000) return String.format("%.1fM", n / 1_000_000.0);
        if (n >= 1_000) return String.format("%.1fK", n / 1_000.0);
        return String.valueOf(n);
    }

    private void showConversation(String projectDirName, String sessionId) {
        var messages = service.readSessionMessages(projectDirName, sessionId);
        Stage stage = new Stage();
        stage.setTitle("Session: " + sessionId.substring(0, Math.min(8, sessionId.length())) + "...");
        stage.setWidth(700);
        stage.setHeight(500);

        VBox root = new VBox(10);
        root.setPadding(new Insets(15));

        ListView<ChatMessage> list = new ListView<>(FXCollections.observableArrayList(messages));
        list.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(ChatMessage m, boolean empty) {
                super.updateItem(m, empty);
                if (empty || m == null) { setText(null); setGraphic(null); return; }
                VBox box = new VBox(4);
                box.setPadding(new Insets(8));
                String cssClass = switch (m.role()) {
                    case "user" -> "chat-user";
                    case "assistant" -> "chat-assistant";
                    default -> "chat-tool";
                };
                box.getStyleClass().add(cssClass);
                Label role = new Label(m.role().toUpperCase());
                role.getStyleClass().add("text-sm");
                Label body = new Label(m.content());
                body.setWrapText(true);
                body.setMaxWidth(600);
                box.getChildren().addAll(role, body);
                setGraphic(box);
            }
        });

        VBox.setVgrow(list, Priority.ALWAYS);
        root.getChildren().add(list);
        javafx.scene.Scene convScene = new javafx.scene.Scene(root);
        String theme = com.claudetool.config.ThemeManager.getInstance().getThemeCss();
        convScene.getStylesheets().add(getClass().getResource("/css/" + theme).toExternalForm());
        stage.setScene(convScene);
        stage.show();
    }
}
