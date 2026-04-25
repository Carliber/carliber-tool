package com.claudetool.view;

import com.claudetool.model.Project;
import com.claudetool.model.Session;
import com.claudetool.model.SessionTag;
import com.claudetool.storage.JsonStorage;
import com.claudetool.viewmodel.ProjectListViewModel;
import com.claudetool.viewmodel.SessionListViewModel;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.util.StringConverter;
import javafx.scene.layout.*;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

public class SessionListView extends VBox {
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private final SessionListViewModel viewModel;
    private final List<Project> projects;

    public SessionListView(JsonStorage storage, Label statusLabel) {
        viewModel = new SessionListViewModel(storage);
        ProjectListViewModel projectVm = new ProjectListViewModel(storage);
        projectVm.load();
        projects = projectVm.getProjects();

        setSpacing(10);
        setPadding(new Insets(15));

        TextField searchField = new TextField();
        searchField.setPromptText("搜索会话...");
        searchField.setPrefWidth(200);

        ComboBox<String> projectCombo = new ComboBox<>();
        projectCombo.getItems().add(null);
        projects.forEach(p -> projectCombo.getItems().add(p.getName()));
        projectCombo.setPromptText("全部项目");

        ComboBox<SessionTag> tagCombo = new ComboBox<>();
        tagCombo.getItems().add(null);
        tagCombo.getItems().addAll(SessionTag.values());
        tagCombo.setConverter(new StringConverter<>() {
            @Override public String toString(SessionTag t) { return t == null ? "全部标签" : t.getDisplayName(); }
            @Override public SessionTag fromString(String s) { return null; }
        });

        searchField.textProperty().addListener((o, old, val) -> applyFilter(searchField, projectCombo, tagCombo));
        projectCombo.valueProperty().addListener((o, old, val) -> applyFilter(searchField, projectCombo, tagCombo));
        tagCombo.valueProperty().addListener((o, old, val) -> applyFilter(searchField, projectCombo, tagCombo));

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button addBtn = new Button("+ 新建会话");
        addBtn.setOnAction(e -> showEditDialog(null));

        HBox toolbar = new HBox(10, searchField, projectCombo, tagCombo, spacer, addBtn);
        toolbar.setAlignment(Pos.CENTER_LEFT);

        ListView<Session> list = new ListView<>();
        list.setPlaceholder(new Label("暂无会话"));
        list.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(Session s, boolean empty) {
                super.updateItem(s, empty);
                if (empty || s == null) { setText(null); setGraphic(null); return; }
                String projName = projects.stream()
                        .filter(p -> p.getId().equals(s.getProjectId()))
                        .map(Project::getName).findFirst().orElse("无项目");
                VBox box = new VBox(4);
                Label title = new Label("[" + s.getTag().getDisplayName() + "] " + s.getTitle());
                title.getStyleClass().add("text-bold");
                Label info = new Label(projName + " | " + (s.getStartedAt() != null ? s.getStartedAt().format(FMT) : "")
                        + formatDuration(s));
                info.getStyleClass().addAll("text-sm", "text-muted");
                String noteText = s.getNotes();
                Label notes = new Label(noteText.length() > 80 ? noteText.substring(0, 80) + "..." : noteText);
                notes.getStyleClass().add("text-sm");
                box.getChildren().addAll(title, info, notes);
                setGraphic(box);
            }
        });
        list.setItems(viewModel.getFiltered());
        ContextMenu ctxMenu = new ContextMenu();
        MenuItem editItem = new MenuItem("编辑");
        editItem.setOnAction(e -> {
            Session sel = list.getSelectionModel().getSelectedItem();
            if (sel != null) showEditDialog(sel);
        });
        MenuItem endItem = new MenuItem("结束会话");
        endItem.setOnAction(e -> {
            Session sel = list.getSelectionModel().getSelectedItem();
            if (sel != null && sel.getEndedAt() == null) {
                viewModel.save(sel.toBuilder().endedAt(LocalDateTime.now()).build());
            }
        });
        MenuItem deleteItem = new MenuItem("删除");
        deleteItem.setOnAction(e -> {
            Session sel = list.getSelectionModel().getSelectedItem();
            if (sel != null) {
                Alert confirm = new Alert(Alert.AlertType.CONFIRMATION, "确认删除会话: " + sel.getTitle() + "?");
                confirm.showAndWait().filter(b -> b == ButtonType.OK).ifPresent(b -> viewModel.delete(sel.getId()));
            }
        });
        ctxMenu.getItems().addAll(editItem, endItem, deleteItem);
        list.setContextMenu(ctxMenu);
        list.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2) {
                Session sel = list.getSelectionModel().getSelectedItem();
                if (sel != null) showEditDialog(sel);
            }
        });
        VBox.setVgrow(list, Priority.ALWAYS);

        viewModel.load();
        viewModel.filter(null, null, null);
        String tagStats = java.util.Arrays.stream(SessionTag.values())
                .map(t -> t.getDisplayName() + ":" + viewModel.getFiltered().stream().filter(s -> s.getTag() == t).count())
                .reduce((a, b) -> a + "  " + b).orElse("");
        statusLabel.setText("会话: " + viewModel.getFiltered().size() + "  |  " + tagStats);
        getChildren().addAll(toolbar, list);
    }

    private void applyFilter(TextField search, ComboBox<String> proj, ComboBox<SessionTag> tag) {
        String pid = null;
        String projName = proj.getValue();
        if (projName != null) {
            pid = projects.stream().filter(p -> p.getName().equals(projName)).map(Project::getId).findFirst().orElse(null);
        }
        viewModel.filter(search.getText(), pid, tag.getValue());
    }

    private String formatDuration(Session s) {
        if (s.getStartedAt() == null) return "";
        LocalDateTime end = s.getEndedAt() != null ? s.getEndedAt() : LocalDateTime.now();
        long minutes = Duration.between(s.getStartedAt(), end).toMinutes();
        if (minutes < 0) return "";
        if (minutes < 60) return " | " + minutes + "分钟";
        long hours = minutes / 60;
        long mins = minutes % 60;
        return " | " + hours + "小时" + (mins > 0 ? mins + "分" : "");
    }

    private void showEditDialog(Session existing) {
        Dialog<Session> dialog = new Dialog<>();
        if (getScene() != null) dialog.initOwner(getScene().getWindow());
        dialog.setTitle(existing == null ? "新建会话" : "编辑会话");
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));

        TextField titleField = new TextField(existing != null ? existing.getTitle() : "");
        titleField.setPromptText("会话标题（必填）");
        Button okBtn = (Button) dialog.getDialogPane().lookupButton(ButtonType.OK);
        okBtn.setDisable(existing == null);
        titleField.textProperty().addListener((o, old, val) -> okBtn.setDisable(val == null || val.isBlank()));
        ComboBox<String> projCombo = new ComboBox<>();
        projCombo.getItems().add("无项目");
        projects.forEach(p -> projCombo.getItems().add(p.getName()));
        if (existing != null) {
            projects.stream().filter(p -> p.getId().equals(existing.getProjectId()))
                    .map(Project::getName).findFirst().ifPresent(projCombo::setValue);
        } else { projCombo.setValue("无项目"); }

        ComboBox<SessionTag> tagCombo = new ComboBox<>(javafx.collections.FXCollections.observableArrayList(SessionTag.values()));
        tagCombo.setValue(existing != null ? existing.getTag() : SessionTag.OTHER);

        TextArea notesField = new TextArea(existing != null ? existing.getNotes() : "");
        notesField.setPromptText("会话笔记");
        notesField.setPrefRowCount(4);

        grid.add(new Label("标题:"), 0, 0); grid.add(titleField, 1, 0);
        grid.add(new Label("项目:"), 0, 1); grid.add(projCombo, 1, 1);
        grid.add(new Label("标签:"), 0, 2); grid.add(tagCombo, 1, 2);
        grid.add(new Label("笔记:"), 0, 3); grid.add(notesField, 1, 3);
        dialog.getDialogPane().setContent(grid);

        dialog.setResultConverter(btn -> {
            if (btn != ButtonType.OK) return null;
            String projName = projCombo.getValue();
            String pid = "无项目".equals(projName) ? null :
                    projects.stream().filter(p -> p.getName().equals(projName)).map(Project::getId).findFirst().orElse(null);
            if (existing == null) {
                return Session.builder().title(titleField.getText().trim()).projectId(pid)
                        .tag(tagCombo.getValue()).notes(notesField.getText().trim()).build();
            }
            return existing.toBuilder().title(titleField.getText().trim()).projectId(pid)
                    .tag(tagCombo.getValue()).notes(notesField.getText().trim()).build();
        });

        dialog.showAndWait().ifPresent(s -> {
            if (s.getTitle() != null && !s.getTitle().isBlank()) viewModel.save(s);
        });
    }
}
