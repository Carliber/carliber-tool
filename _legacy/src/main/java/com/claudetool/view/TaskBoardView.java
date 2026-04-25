package com.claudetool.view;

import com.claudetool.model.Project;
import com.claudetool.model.Task;
import com.claudetool.model.TaskPriority;
import com.claudetool.model.TaskStatus;
import java.time.LocalDate;
import com.claudetool.storage.JsonStorage;
import com.claudetool.viewmodel.ProjectListViewModel;
import com.claudetool.viewmodel.TaskBoardViewModel;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.control.Menu;
import javafx.util.StringConverter;
import javafx.scene.layout.*;

import javafx.scene.input.ClipboardContent;
import javafx.scene.input.Dragboard;
import javafx.scene.input.TransferMode;

import java.time.format.DateTimeFormatter;
import java.util.List;

public class TaskBoardView extends VBox {
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd");
    private final TaskBoardViewModel viewModel;
    private final List<Project> projects;

    public TaskBoardView(JsonStorage storage, Label statusLabel) {
        viewModel = new TaskBoardViewModel(storage);
        ProjectListViewModel projectVm = new ProjectListViewModel(storage);
        projectVm.load();
        projects = projectVm.getProjects();

        setSpacing(10);
        setPadding(new Insets(15));

        ComboBox<String> projectCombo = new ComboBox<>();
        projectCombo.getItems().add(null);
        projects.forEach(p -> projectCombo.getItems().add(p.getName()));
        projectCombo.setPromptText("全部项目");
        projectCombo.valueProperty().addListener((o, old, val) -> {
            String pid = val == null ? null : projects.stream().filter(p -> p.getName().equals(val)).map(Project::getId).findFirst().orElse(null);
            viewModel.setProjectIdFilter(pid);
            viewModel.applyFilters();
        });

        ComboBox<TaskPriority> priorityCombo = new ComboBox<>();
        priorityCombo.getItems().add(null);
        priorityCombo.getItems().addAll(TaskPriority.values());
        priorityCombo.setConverter(new StringConverter<>() {
            @Override public String toString(TaskPriority p) { return p == null ? "全部优先级" : p.getDisplayName(); }
            @Override public TaskPriority fromString(String s) { return null; }
        });
        priorityCombo.valueProperty().addListener((o, old, val) -> {
            viewModel.setPriorityFilter(val);
            viewModel.applyFilters();
        });

        ComboBox<String> sortCombo = new ComboBox<>();
        sortCombo.getItems().addAll("默认", "优先级", "截止日期", "创建时间");
        sortCombo.setValue("默认");
        sortCombo.valueProperty().addListener((o, old, val) -> {
            viewModel.setSorter(switch (val) {
                case "优先级" -> TaskBoardViewModel.SORT_PRIORITY;
                case "截止日期" -> TaskBoardViewModel.SORT_DUE_DATE;
                case "创建时间" -> TaskBoardViewModel.SORT_CREATED;
                default -> null;
            });
            viewModel.applyFilters();
        });

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button addBtn = new Button("+ 新建任务");
        addBtn.setTooltip(new Tooltip("创建新任务 (Ctrl+N)"));
        addBtn.setOnAction(e -> showEditDialog(null));

        Button exportBtn = new Button("导出");
        exportBtn.setTooltip(new Tooltip("导出任务列表到剪贴板"));
        exportBtn.setOnAction(e -> {
            StringBuilder sb = new StringBuilder("任务列表\n========\n\n");
            for (Task t : viewModel.getAllTasks()) {
                sb.append("- [").append(t.getStatus().getDisplayName()).append("] ")
                        .append(t.getTitle()).append(" (").append(t.getPriority().getDisplayName()).append(")\n");
                if (t.getDescription() != null && !t.getDescription().isEmpty()) {
                    sb.append("  ").append(t.getDescription()).append("\n");
                }
            }
            javafx.scene.input.ClipboardContent cc = new javafx.scene.input.ClipboardContent();
            cc.putString(sb.toString());
            javafx.scene.input.Clipboard.getSystemClipboard().setContent(cc);
            Alert info = new Alert(Alert.AlertType.INFORMATION, "已复制到剪贴板 (" + viewModel.getAllTasks().size() + " 个任务)");
            info.show();
        });

        HBox toolbar = new HBox(10, projectCombo, priorityCombo, sortCombo, spacer, addBtn, exportBtn);
        toolbar.setAlignment(Pos.CENTER_LEFT);

        HBox board = new HBox(15);
        board.setPadding(new Insets(10));
        HBox.setHgrow(board, Priority.ALWAYS);
        VBox.setVgrow(board, Priority.ALWAYS);

        VBox todoCol = createColumn("待办", viewModel.getTodoTasks(), TaskStatus.TODO);
        VBox progressCol = createColumn("进行中", viewModel.getInProgressTasks(), TaskStatus.IN_PROGRESS);
        VBox doneCol = createColumn("已完成", viewModel.getDoneTasks(), TaskStatus.DONE);

        HBox.setHgrow(todoCol, Priority.ALWAYS);
        HBox.setHgrow(progressCol, Priority.ALWAYS);
        HBox.setHgrow(doneCol, Priority.ALWAYS);

        board.getChildren().addAll(todoCol, progressCol, doneCol);

        viewModel.load();
        statusLabel.setText("任务: " + viewModel.getAllTasks().size());

        getChildren().addAll(toolbar, board);
    }

    private VBox createColumn(String title, javafx.collections.ObservableList<Task> tasks, TaskStatus status) {
        VBox col = new VBox(8);
        col.getStyleClass().add("task-column");
        col.setPrefWidth(350);

        Label header = new Label();
        header.getStyleClass().add("task-column-header");
        header.textProperty().bind(javafx.beans.binding.Bindings.format(title + " (%d)", javafx.beans.binding.Bindings.size(tasks)));

        ListView<Task> list = new ListView<>(tasks);
        list.setPlaceholder(new Label("暂无任务"));
        setupDragAndDrop(list, status);
        list.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(Task t, boolean empty) {
                super.updateItem(t, empty);
                if (empty || t == null) { setText(null); setGraphic(null); return; }
                VBox card = new VBox(4);
                card.setPadding(new Insets(8));
                card.getStyleClass().addAll("task-card", "task-card-" + t.getPriority().name().toLowerCase());
                String tooltipText = t.getTitle() + "\n" + t.getStatus().getDisplayName() + " | " + t.getPriority().getDisplayName()
                        + (t.getDescription() != null && !t.getDescription().isEmpty() ? "\n" + t.getDescription() : "");
                Tooltip tooltip = new Tooltip(tooltipText.length() > 200 ? tooltipText.substring(0, 200) + "..." : tooltipText);
                Tooltip.install(card, tooltip);
                if (t.getStatus() != TaskStatus.DONE && t.getDueDate() != null && t.getDueDate().isBefore(LocalDate.now())) {
                    card.getStyleClass().add("task-card-overdue");
                }
                Label tLabel = new Label(t.getTitle());
                tLabel.getStyleClass().add("task-card-title");
                card.getChildren().add(tLabel);
                if (t.getDescription() != null && !t.getDescription().isEmpty()) {
                    String desc = t.getDescription().length() > 60 ? t.getDescription().substring(0, 60) + "..." : t.getDescription();
                    Label descLabel = new Label(desc);
                    descLabel.getStyleClass().add("task-card-meta");
                    card.getChildren().add(descLabel);
                }
                String projName = projects.stream()
                        .filter(p -> p.getId().equals(t.getProjectId()))
                        .map(Project::getName).findFirst().orElse("");
                String dueStr = "";
                if (t.getDueDate() != null) {
                    dueStr = " | " + (t.getStatus() != TaskStatus.DONE && t.getDueDate().isBefore(LocalDate.now())
                            ? "逾期 " : "截止 ") + t.getDueDate().format(FMT);
                }
                Label info = new Label((projName.isEmpty() ? "" : projName) + dueStr);
                info.getStyleClass().add("task-card-meta");
                card.getChildren().add(info);
                setGraphic(card);
            }
        });
        ContextMenu ctxMenu = new ContextMenu();
        Menu moveToMenu = new Menu("移动到");
        for (TaskStatus ts : TaskStatus.values()) {
            if (ts != status) {
                MenuItem mi = new MenuItem(ts.getDisplayName());
                mi.setOnAction(ev -> {
                    Task sel = list.getSelectionModel().getSelectedItem();
                    if (sel != null) viewModel.moveTask(sel.getId(), ts);
                });
                moveToMenu.getItems().add(mi);
            }
        }
        MenuItem editItem = new MenuItem("编辑");
        editItem.setOnAction(e -> {
            Task sel = list.getSelectionModel().getSelectedItem();
            if (sel != null) showEditDialog(sel);
        });
        MenuItem deleteItem = new MenuItem("删除");
        deleteItem.setOnAction(e -> {
            Task sel = list.getSelectionModel().getSelectedItem();
            if (sel != null) {
                Alert confirm = new Alert(Alert.AlertType.CONFIRMATION, "确认删除任务: " + sel.getTitle() + "?");
                confirm.showAndWait().filter(b -> b == ButtonType.OK).ifPresent(b -> viewModel.delete(sel.getId()));
            }
        });
        ctxMenu.getItems().addAll(moveToMenu, editItem, deleteItem);
        list.setContextMenu(ctxMenu);
        list.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2) {
                Task sel = list.getSelectionModel().getSelectedItem();
                if (sel != null) showEditDialog(sel);
            }
        });
        VBox.setVgrow(list, Priority.ALWAYS);
        col.getChildren().addAll(header, list);
        return col;
    }

    private void setupDragAndDrop(ListView<Task> list, TaskStatus targetStatus) {
        list.setOnDragDetected(e -> {
            Task sel = list.getSelectionModel().getSelectedItem();
            if (sel == null) return;
            Dragboard db = list.startDragAndDrop(TransferMode.MOVE);
            ClipboardContent cc = new ClipboardContent();
            cc.putString(sel.getId());
            db.setContent(cc);
            e.consume();
        });
        list.setOnDragOver(e -> {
            if (e.getDragboard().hasString()) e.acceptTransferModes(TransferMode.MOVE);
            e.consume();
        });
        list.setOnDragDropped(e -> {
            Dragboard db = e.getDragboard();
            if (db.hasString()) {
                viewModel.moveTask(db.getString(), targetStatus);
                e.setDropCompleted(true);
            }
            e.consume();
        });
        list.setOnDragDone(e -> e.consume());
    }

    private void showEditDialog(Task existing) {
        Dialog<Task> dialog = new Dialog<>();
        if (getScene() != null) dialog.initOwner(getScene().getWindow());
        dialog.setTitle(existing == null ? "新建任务" : "编辑任务");
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));

        TextField titleField = new TextField(existing != null ? existing.getTitle() : "");
        titleField.setPromptText("任务标题（必填）");

        Button okBtn = (Button) dialog.getDialogPane().lookupButton(ButtonType.OK);
        okBtn.setDisable(existing == null);
        titleField.textProperty().addListener((o, old, val) -> okBtn.setDisable(val == null || val.isBlank()));

        TextArea descField = new TextArea(existing != null ? existing.getDescription() : "");
        descField.setPromptText("描述");
        descField.setPrefRowCount(3);

        ComboBox<String> projCombo = new ComboBox<>();
        projCombo.getItems().add("无项目");
        projects.forEach(p -> projCombo.getItems().add(p.getName()));
        if (existing != null) {
            projects.stream().filter(p -> p.getId().equals(existing.getProjectId()))
                    .map(Project::getName).findFirst().ifPresent(projCombo::setValue);
        } else { projCombo.setValue("无项目"); }

        ComboBox<TaskStatus> statusCombo = new ComboBox<>(javafx.collections.FXCollections.observableArrayList(TaskStatus.values()));
        statusCombo.setValue(existing != null ? existing.getStatus() : TaskStatus.TODO);

        ComboBox<TaskPriority> prioCombo = new ComboBox<>(javafx.collections.FXCollections.observableArrayList(TaskPriority.values()));
        prioCombo.setValue(existing != null ? existing.getPriority() : TaskPriority.MEDIUM);

        DatePicker duePicker = new DatePicker(existing != null ? existing.getDueDate() : null);

        grid.add(new Label("标题:"), 0, 0); grid.add(titleField, 1, 0);
        grid.add(new Label("描述:"), 0, 1); grid.add(descField, 1, 1);
        grid.add(new Label("项目:"), 0, 2); grid.add(projCombo, 1, 2);
        grid.add(new Label("状态:"), 0, 3); grid.add(statusCombo, 1, 3);
        grid.add(new Label("优先级:"), 0, 4); grid.add(prioCombo, 1, 4);
        grid.add(new Label("截止日期:"), 0, 5); grid.add(duePicker, 1, 5);
        dialog.getDialogPane().setContent(grid);

        dialog.setResultConverter(btn -> {
            if (btn != ButtonType.OK) return null;
            String projName = projCombo.getValue();
            String pid = "无项目".equals(projName) ? null :
                    projects.stream().filter(p -> p.getName().equals(projName)).map(Project::getId).findFirst().orElse(null);
            if (existing == null) {
                return Task.builder().title(titleField.getText().trim()).description(descField.getText().trim())
                        .projectId(pid).status(statusCombo.getValue()).priority(prioCombo.getValue())
                        .dueDate(duePicker.getValue()).build();
            }
            return existing.toBuilder().title(titleField.getText().trim()).description(descField.getText().trim())
                    .projectId(pid).status(statusCombo.getValue()).priority(prioCombo.getValue())
                    .dueDate(duePicker.getValue()).build();
        });

        dialog.showAndWait().ifPresent(t -> {
            if (t.getTitle() != null && !t.getTitle().isBlank()) viewModel.save(t);
        });
    }
}
