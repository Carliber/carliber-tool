package com.claudetool.view;

import com.claudetool.model.*;
import com.claudetool.storage.JsonStorage;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

public class SearchView extends VBox {
    private final JsonStorage storage;
    private final Consumer<String> onNavigate;
    private List<Project> projects;
    private List<Session> sessions;
    private List<Task> tasks;

    public SearchView(JsonStorage storage, Label statusLabel, Consumer<String> onNavigate) {
        this.storage = storage;
        this.onNavigate = onNavigate;
        setSpacing(10);
        setPadding(new Insets(15));

        loadAll();

        TextField searchField = new TextField();
        searchField.setPromptText("输入关键词搜索项目、会话、任务...");
        searchField.setPrefWidth(500);

        VBox results = new VBox(10);

        Label countLabel = new Label();
        countLabel.getStyleClass().add("text-muted");

        searchField.textProperty().addListener((o, old, val) -> {
            results.getChildren().clear();
            if (val == null || val.isBlank()) {
                countLabel.setText("");
                return;
            }
            String q = val.trim().toLowerCase();
            int total = 0;

            List<Project> matchedProj = projects.stream()
                    .filter(p -> match(p, q)).toList();
            List<Session> matchedSess = sessions.stream()
                    .filter(s -> match(s, q)).toList();
            List<Task> matchedTask = tasks.stream()
                    .filter(t -> match(t, q)).toList();

            if (!matchedProj.isEmpty()) {
                results.getChildren().add(makeSection("项目", matchedProj.size()));
                for (Project p : matchedProj) {
                    results.getChildren().add(makeProjectRow(p));
                    total++;
                }
            }
            if (!matchedSess.isEmpty()) {
                results.getChildren().add(makeSection("会话", matchedSess.size()));
                for (Session s : matchedSess) {
                    results.getChildren().add(makeSessionRow(s));
                    total++;
                }
            }
            if (!matchedTask.isEmpty()) {
                results.getChildren().add(makeSection("任务", matchedTask.size()));
                for (Task t : matchedTask) {
                    results.getChildren().add(makeTaskRow(t));
                    total++;
                }
            }
            countLabel.setText("共 " + total + " 条结果");
        });

        HBox toolbar = new HBox(10, searchField);
        toolbar.setAlignment(Pos.CENTER_LEFT);
        ScrollPane scroll = new ScrollPane(results);
        scroll.setFitToWidth(true);
        VBox.setVgrow(scroll, Priority.ALWAYS);

        getChildren().addAll(toolbar, countLabel, scroll);
        statusLabel.setText("全局搜索");
    }

    private void loadAll() {
        projects = new ArrayList<>(storage.loadAll("projects", Project.class));
        sessions = new ArrayList<>(storage.loadAll("sessions", Session.class));
        tasks = new ArrayList<>(storage.loadAll("tasks", Task.class));
    }

    private boolean match(Project p, String q) {
        return contains(p.getName(), q) || contains(p.getDescription(), q)
                || contains(p.getPath(), q) || p.getTags().stream().anyMatch(t -> t.toLowerCase().contains(q));
    }

    private boolean match(Session s, String q) {
        return contains(s.getTitle(), q) || contains(s.getNotes(), q);
    }

    private boolean match(Task t, String q) {
        return contains(t.getTitle(), q) || contains(t.getDescription(), q);
    }

    private boolean contains(String text, String q) {
        return text != null && text.toLowerCase().contains(q);
    }

    private Label makeSection(String type, int count) {
        Label label = new Label(type + " (" + count + ")");
        label.getStyleClass().add("title-sm");
        label.setPadding(new Insets(10, 0, 4, 0));
        return label;
    }

    private HBox makeProjectRow(Project p) {
        VBox box = new VBox(2);
        Label name = new Label(p.getName());
        name.getStyleClass().add("text-bold");
        Label desc = new Label(truncate(p.getDescription()));
        desc.getStyleClass().add("text-sm");
        box.getChildren().addAll(name, desc);
        HBox row = new HBox(10, box);
        row.getStyleClass().add("stat-card");
        row.setPadding(new Insets(8));
        row.setOnMouseClicked(e -> { if (onNavigate != null) onNavigate.accept("projects"); });
        row.setCursor(javafx.scene.Cursor.HAND);
        return row;
    }

    private HBox makeSessionRow(Session s) {
        VBox box = new VBox(2);
        Label title = new Label("[" + s.getTag().getDisplayName() + "] " + s.getTitle());
        title.getStyleClass().add("text-bold");
        Label notes = new Label(truncate(s.getNotes()));
        notes.getStyleClass().add("text-sm");
        box.getChildren().addAll(title, notes);
        HBox row = new HBox(10, box);
        row.getStyleClass().add("stat-card");
        row.setPadding(new Insets(8));
        row.setOnMouseClicked(e -> { if (onNavigate != null) onNavigate.accept("sessions"); });
        row.setCursor(javafx.scene.Cursor.HAND);
        return row;
    }

    private HBox makeTaskRow(Task t) {
        VBox box = new VBox(2);
        Label title = new Label(t.getTitle());
        title.getStyleClass().add("text-bold");
        String projName = projects.stream()
                .filter(p -> p.getId().equals(t.getProjectId()))
                .map(Project::getName).findFirst().orElse("");
        Label meta = new Label(t.getStatus().getDisplayName() + " | " + t.getPriority().getDisplayName()
                + (projName.isEmpty() ? "" : " | " + projName));
        meta.getStyleClass().add("task-card-meta");
        box.getChildren().addAll(title, meta);
        HBox row = new HBox(10, box);
        row.getStyleClass().add("stat-card");
        row.setPadding(new Insets(8));
        row.setOnMouseClicked(e -> { if (onNavigate != null) onNavigate.accept("tasks"); });
        row.setCursor(javafx.scene.Cursor.HAND);
        return row;
    }

    private String truncate(String s) {
        if (s == null || s.isEmpty()) return "";
        return s.length() > 100 ? s.substring(0, 100) + "..." : s;
    }
}
