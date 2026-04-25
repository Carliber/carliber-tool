package com.claudetool.view;

import com.claudetool.model.*;
import com.claudetool.storage.JsonStorage;
import com.claudetool.util.DesktopUtil;
import com.claudetool.viewmodel.NavigationState;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.input.MouseButton;
import javafx.scene.layout.*;
import javafx.util.StringConverter;

import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;

public class ProjectDetailView extends VBox {
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter SHORT_FMT = DateTimeFormatter.ofPattern("MM-dd HH:mm");
    private final JsonStorage storage;
    private final Label statusLabel;
    private final NavigationState nav;
    private Project project;
    private List<Session> sessions;
    private List<Task> tasks;

    public ProjectDetailView(JsonStorage storage, String projectId, Label statusLabel) {
        this(storage, projectId, statusLabel, null);
    }

    public ProjectDetailView(JsonStorage storage, String projectId, Label statusLabel, NavigationState nav) {
        this.storage = storage;
        this.statusLabel = statusLabel;
        this.nav = nav;
        setSpacing(15);
        setPadding(new Insets(20));

        project = storage.findById("projects", Project.class, projectId).orElse(null);
        if (project == null) {
            getChildren().add(new Label("项目不存在"));
            statusLabel.setText("项目不存在");
            return;
        }

        sessions = storage.loadAll("sessions", Session.class).stream()
                .filter(s -> projectId.equals(s.getProjectId())).toList();
        tasks = storage.loadAll("tasks", Task.class).stream()
                .filter(t -> projectId.equals(t.getProjectId())).toList();

        getChildren().addAll(createHeader(), new Separator(), createInfoGrid(), new Separator(),
                createSessionSection(), new Separator(), createTaskSection());

        statusLabel.setText("项目详情: " + project.getName());
    }

    private HBox createHeader() {
        HBox header = new HBox(15);
        header.setAlignment(Pos.CENTER_LEFT);

        Button backBtn = new Button("← 返回");
        backBtn.setOnAction(e -> {
            if (nav != null) nav.navigateTo(NavigationState.Page.HOME);
        });

        Label name = new Label(project.getName());
        name.getStyleClass().add("title-lg");

        Label statusBadge = new Label(project.getStatus().getDisplayName());
        statusBadge.getStyleClass().addAll("status-badge", "status-" + project.getStatus().name().toLowerCase());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button editBtn = new Button("编辑");
        editBtn.setOnAction(e -> showEditDialog());

        Button openDirBtn = new Button("打开目录");
        openDirBtn.setOnAction(e -> DesktopUtil.openDirectory(project.getPath()));

        Button openTermBtn = new Button("打开终端");
        openTermBtn.setOnAction(e -> DesktopUtil.openTerminal(project.getPath()));

        header.getChildren().addAll(backBtn, name, statusBadge, spacer, editBtn, openDirBtn, openTermBtn);
        return header;
    }

    private GridPane createInfoGrid() {
        GridPane grid = new GridPane();
        grid.setHgap(15);
        grid.setVgap(8);
        grid.getStyleClass().add("info-grid");

        int row = 0;
        addInfoRow(grid, row++, "路径", project.getPath());
        addInfoRow(grid, row++, "描述", project.getDescription() != null && !project.getDescription().isEmpty()
                ? project.getDescription() : "无");
        addInfoRow(grid, row++, "标签", project.getTags().isEmpty() ? "无" : String.join(", ", project.getTags()));
        addInfoRow(grid, row++, "创建时间", project.getCreatedAt() != null ? project.getCreatedAt().format(FMT) : "");
        addInfoRow(grid, row++, "更新时间", project.getUpdatedAt() != null ? project.getUpdatedAt().format(FMT) : "");
        addInfoRow(grid, row++, "会话数", String.valueOf(sessions.size()));
        addInfoRow(grid, row++, "任务数", String.valueOf(tasks.size()));

        long doneCount = tasks.stream().filter(t -> t.getStatus() == TaskStatus.DONE).count();
        long todoCount = tasks.stream().filter(t -> t.getStatus() == TaskStatus.TODO).count();
        long progressCount = tasks.stream().filter(t -> t.getStatus() == TaskStatus.IN_PROGRESS).count();
        addInfoRow(grid, row, "任务进度", todoCount + " 待办 / " + progressCount + " 进行中 / " + doneCount + " 完成");

        return grid;
    }

    private void addInfoRow(GridPane grid, int row, String label, String value) {
        Label key = new Label(label + ":");
        key.getStyleClass().add("info-label");
        key.setMinWidth(80);
        Label val = new Label(value);
        val.setWrapText(true);
        val.setMaxWidth(600);
        grid.add(key, 0, row);
        grid.add(val, 1, row);
    }

    private VBox createSessionSection() {
        VBox section = new VBox(8);

        HBox header = new HBox(10);
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("关联会话 (" + sessions.size() + ")");
        title.getStyleClass().add("title-sm");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        Button addSessionBtn = new Button("+ 新建会话");
        addSessionBtn.setOnAction(e -> showSessionDialog(null));
        header.getChildren().addAll(title, spacer, addSessionBtn);

        ListView<Session> list = new ListView<>(FXCollections.observableArrayList(sessions));
        list.setPrefHeight(Math.min(200, sessions.size() * 60 + 40));
        list.setPlaceholder(new Label("暂无关联会话"));
        list.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(Session s, boolean empty) {
                super.updateItem(s, empty);
                if (empty || s == null) { setText(null); setGraphic(null); return; }
                VBox box = new VBox(3);
                Label t = new Label("[" + s.getTag().getDisplayName() + "] " + s.getTitle());
                t.getStyleClass().add("text-bold");
                Label info = new Label((s.getStartedAt() != null ? s.getStartedAt().format(SHORT_FMT) : "")
                        + (s.getNotes() != null && !s.getNotes().isEmpty() ? " | " + s.getNotes() : ""));
                info.getStyleClass().add("text-sm");
                info.setWrapText(true);
                box.getChildren().addAll(t, info);
                setGraphic(box);
            }
        });
        list.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2) {
                Session sel = list.getSelectionModel().getSelectedItem();
                if (sel != null) showSessionDialog(sel);
            }
        });

        section.getChildren().addAll(header, list);
        return section;
    }

    private VBox createTaskSection() {
        VBox section = new VBox(8);

        HBox header = new HBox(10);
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("关联任务 (" + tasks.size() + ")");
        title.getStyleClass().add("title-sm");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        Button addTaskBtn = new Button("+ 新建任务");
        addTaskBtn.setOnAction(e -> showTaskDialog(null));
        header.getChildren().addAll(title, spacer, addTaskBtn);

        TableView<Task> table = new TableView<>(FXCollections.observableArrayList(tasks));
        table.setPrefHeight(Math.min(200, tasks.size() * 30 + 50));
        table.setPlaceholder(new Label("暂无关联任务"));
        table.setRowFactory(tv -> {
            TableRow<Task> row = new TableRow<>();
            row.setOnMouseClicked(e -> {
                if (e.getButton() == MouseButton.PRIMARY && e.getClickCount() == 2 && !row.isEmpty()) {
                    showTaskDialog(row.getItem());
                }
            });
            return row;
        });

        TableColumn<Task, String> titleCol = new TableColumn<>("标题");
        titleCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getTitle()));
        titleCol.setPrefWidth(200);

        TableColumn<Task, String> statusCol = new TableColumn<>("状态");
        statusCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStatus().getDisplayName()));
        statusCol.setPrefWidth(80);

        TableColumn<Task, String> prioCol = new TableColumn<>("优先级");
        prioCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getPriority().getDisplayName()));
        prioCol.setPrefWidth(80);

        TableColumn<Task, String> dueCol = new TableColumn<>("截止日期");
        dueCol.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getDueDate() != null ? d.getValue().getDueDate().format(DateTimeFormatter.ofPattern("MM-dd")) : ""));
        dueCol.setPrefWidth(80);

        table.getColumns().addAll(titleCol, statusCol, prioCol, dueCol);

        section.getChildren().addAll(header, table);
        return section;
    }

    private void showEditDialog() {
        Dialog<Project> dialog = new Dialog<>();
        if (getScene() != null) dialog.initOwner(getScene().getWindow());
        dialog.setTitle("编辑项目");
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));

        TextField nameField = new TextField(project.getName());
        nameField.setPromptText("项目名称");
        TextField pathField = new TextField(project.getPath());
        pathField.setPromptText("项目路径");
        TextArea descField = new TextArea(project.getDescription());
        descField.setPromptText("描述");
        descField.setPrefRowCount(3);
        TextField tagsField = new TextField(String.join(", ", project.getTags()));
        tagsField.setPromptText("标签（逗号分隔）");
        ComboBox<ProjectStatus> statusCombo = new ComboBox<>(FXCollections.observableArrayList(ProjectStatus.values()));
        statusCombo.setValue(project.getStatus());

        grid.add(new Label("名称:"), 0, 0); grid.add(nameField, 1, 0);
        grid.add(new Label("路径:"), 0, 1); grid.add(pathField, 1, 1);
        grid.add(new Label("描述:"), 0, 2); grid.add(descField, 1, 2);
        grid.add(new Label("标签:"), 0, 3); grid.add(tagsField, 1, 3);
        grid.add(new Label("状态:"), 0, 4); grid.add(statusCombo, 1, 4);
        dialog.getDialogPane().setContent(grid);

        dialog.setResultConverter(btn -> {
            if (btn != ButtonType.OK) return null;
            String tags = tagsField.getText().trim();
            List<String> tagList = tags.isEmpty() ? List.of() :
                    Arrays.stream(tags.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
            return project.toBuilder().name(nameField.getText().trim()).path(pathField.getText().trim())
                    .description(descField.getText().trim()).tags(tagList).status(statusCombo.getValue()).build();
        });

        dialog.showAndWait().ifPresent(p -> {
            storage.save("projects", Project.class, p);
            project = p;
            statusLabel.setText("项目详情: " + p.getName() + " (已更新)");
        });
    }

    private void showSessionDialog(Session existing) {
        Dialog<Session> dialog = new Dialog<>();
        if (getScene() != null) dialog.initOwner(getScene().getWindow());
        dialog.setTitle(existing == null ? "新建会话" : "编辑会话");
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));

        TextField titleField = new TextField(existing != null ? existing.getTitle() : "");
        titleField.setPromptText("会话标题");
        Button okBtn = (Button) dialog.getDialogPane().lookupButton(ButtonType.OK);
        okBtn.setDisable(existing == null);
        titleField.textProperty().addListener((o, old, val) -> okBtn.setDisable(val == null || val.isBlank()));

        ComboBox<SessionTag> tagCombo = new ComboBox<>(FXCollections.observableArrayList(SessionTag.values()));
        tagCombo.setValue(existing != null ? existing.getTag() : SessionTag.OTHER);
        tagCombo.setConverter(new StringConverter<>() {
            @Override public String toString(SessionTag t) { return t.getDisplayName(); }
            @Override public SessionTag fromString(String s) { return null; }
        });

        TextArea notesField = new TextArea(existing != null ? existing.getNotes() : "");
        notesField.setPromptText("笔记");
        notesField.setPrefRowCount(3);

        grid.add(new Label("标题:"), 0, 0); grid.add(titleField, 1, 0);
        grid.add(new Label("标签:"), 0, 1); grid.add(tagCombo, 1, 1);
        grid.add(new Label("笔记:"), 0, 2); grid.add(notesField, 1, 2);
        dialog.getDialogPane().setContent(grid);

        dialog.setResultConverter(btn -> {
            if (btn != ButtonType.OK) return null;
            if (existing == null) {
                return Session.builder().title(titleField.getText().trim())
                        .projectId(project.getId()).tag(tagCombo.getValue())
                        .notes(notesField.getText().trim()).build();
            }
            return existing.toBuilder().title(titleField.getText().trim())
                    .tag(tagCombo.getValue()).notes(notesField.getText().trim()).build();
        });

        dialog.showAndWait().ifPresent(s -> {
            storage.save("sessions", Session.class, s);
            sessions = storage.loadAll("sessions", Session.class).stream()
                    .filter(ss -> project.getId().equals(ss.getProjectId())).toList();
            statusLabel.setText("会话已保存");
        });
    }

    private void showTaskDialog(Task existing) {
        Dialog<Task> dialog = new Dialog<>();
        if (getScene() != null) dialog.initOwner(getScene().getWindow());
        dialog.setTitle(existing == null ? "新建任务" : "编辑任务");
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));

        TextField titleField = new TextField(existing != null ? existing.getTitle() : "");
        titleField.setPromptText("任务标题");
        Button okBtn = (Button) dialog.getDialogPane().lookupButton(ButtonType.OK);
        okBtn.setDisable(existing == null);
        titleField.textProperty().addListener((o, old, val) -> okBtn.setDisable(val == null || val.isBlank()));

        TextArea descField = new TextArea(existing != null ? existing.getDescription() : "");
        descField.setPromptText("描述");
        descField.setPrefRowCount(2);

        ComboBox<TaskStatus> statusCombo = new ComboBox<>(FXCollections.observableArrayList(TaskStatus.values()));
        statusCombo.setValue(existing != null ? existing.getStatus() : TaskStatus.TODO);
        ComboBox<TaskPriority> prioCombo = new ComboBox<>(FXCollections.observableArrayList(TaskPriority.values()));
        prioCombo.setValue(existing != null ? existing.getPriority() : TaskPriority.MEDIUM);
        DatePicker duePicker = new DatePicker(existing != null ? existing.getDueDate() : null);

        grid.add(new Label("标题:"), 0, 0); grid.add(titleField, 1, 0);
        grid.add(new Label("描述:"), 0, 1); grid.add(descField, 1, 1);
        grid.add(new Label("状态:"), 0, 2); grid.add(statusCombo, 1, 2);
        grid.add(new Label("优先级:"), 0, 3); grid.add(prioCombo, 1, 3);
        grid.add(new Label("截止日期:"), 0, 4); grid.add(duePicker, 1, 4);
        dialog.getDialogPane().setContent(grid);

        dialog.setResultConverter(btn -> {
            if (btn != ButtonType.OK) return null;
            if (existing == null) {
                return Task.builder().title(titleField.getText().trim()).description(descField.getText().trim())
                        .projectId(project.getId()).status(statusCombo.getValue())
                        .priority(prioCombo.getValue()).dueDate(duePicker.getValue()).build();
            }
            return existing.toBuilder().title(titleField.getText().trim()).description(descField.getText().trim())
                    .status(statusCombo.getValue()).priority(prioCombo.getValue())
                    .dueDate(duePicker.getValue()).build();
        });

        dialog.showAndWait().ifPresent(t -> {
            storage.save("tasks", Task.class, t);
            tasks = storage.loadAll("tasks", Task.class).stream()
                    .filter(tt -> project.getId().equals(tt.getProjectId())).toList();
            statusLabel.setText("任务已保存");
        });
    }
}
