package com.claudetool.view;

import com.claudetool.model.Project;
import com.claudetool.model.ProjectStatus;
import com.claudetool.model.Session;
import com.claudetool.model.Task;
import com.claudetool.storage.JsonStorage;
import com.claudetool.viewmodel.NavigationState;
import com.claudetool.viewmodel.ProjectListViewModel;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.util.StringConverter;
import javafx.scene.input.MouseButton;
import javafx.scene.layout.*;

import java.time.format.DateTimeFormatter;
import java.util.Arrays;

public class ProjectListView extends VBox {
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd HH:mm");
    private final ProjectListViewModel viewModel;
    private final NavigationState nav;

    public ProjectListView(JsonStorage storage, Label statusLabel, NavigationState nav) {
        viewModel = new ProjectListViewModel(storage);
        this.nav = nav;
        setSpacing(10);
        setPadding(new Insets(15));

        TextField searchField = new TextField();
        searchField.setPromptText("搜索项目...");
        searchField.setPrefWidth(250);

        ComboBox<ProjectStatus> statusCombo = new ComboBox<>();
        statusCombo.getItems().add(null);
        statusCombo.getItems().addAll(ProjectStatus.values());
        statusCombo.setConverter(new StringConverter<>() {
            @Override public String toString(ProjectStatus s) { return s == null ? "全部状态" : s.getDisplayName(); }
            @Override public ProjectStatus fromString(String s) { return null; }
        });
        statusCombo.setValue(null);

        searchField.textProperty().addListener((o, old, val) -> viewModel.filter(val, statusCombo.getValue()));
        statusCombo.valueProperty().addListener((o, old, val) -> viewModel.filter(searchField.getText(), val));

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button addBtn = new Button("+ 新建项目");
        addBtn.setOnAction(e -> showEditDialog(null));

        HBox toolbar = new HBox(10, searchField, statusCombo, spacer, addBtn);
        toolbar.setAlignment(Pos.CENTER_LEFT);

        TableView<Project> table = new TableView<>();
        table.setPlaceholder(new Label("暂无项目，点击 + 新建项目 添加"));
        table.setRowFactory(tv -> {
            TableRow<Project> row = new TableRow<>();
            row.setOnMouseClicked(e -> {
                if (e.getButton() == MouseButton.PRIMARY && e.getClickCount() == 2 && !row.isEmpty()) {
                    nav.navigateToProject(row.getItem().getId());
                }
            });
            row.setContextMenu(createContextMenu(row));
            return row;
        });

        TableColumn<Project, String> nameCol = new TableColumn<>("名称");
        nameCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getName()));
        nameCol.setPrefWidth(200);

        TableColumn<Project, String> pathCol = new TableColumn<>("路径");
        pathCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getPath()));
        pathCol.setPrefWidth(300);

        TableColumn<Project, String> statusCol = new TableColumn<>("状态");
        statusCol.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStatus().getDisplayName()));
        statusCol.setPrefWidth(80);

        TableColumn<Project, String> tagsCol = new TableColumn<>("标签");
        tagsCol.setCellValueFactory(d -> new SimpleStringProperty(String.join(", ", d.getValue().getTags())));
        tagsCol.setPrefWidth(150);

        TableColumn<Project, String> updatedCol = new TableColumn<>("更新时间");
        updatedCol.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getUpdatedAt() != null ? d.getValue().getUpdatedAt().format(FMT) : ""));
        updatedCol.setPrefWidth(100);

        table.getColumns().addAll(nameCol, pathCol, statusCol, tagsCol, updatedCol);

        java.util.Map<String, Long> taskCounts = storage.loadAll("tasks", Task.class).stream()
                .collect(java.util.stream.Collectors.groupingBy(t -> t.getProjectId() != null ? t.getProjectId() : "", java.util.stream.Collectors.counting()));
        java.util.Map<String, Long> sessionCounts = storage.loadAll("sessions", Session.class).stream()
                .collect(java.util.stream.Collectors.groupingBy(s -> s.getProjectId() != null ? s.getProjectId() : "", java.util.stream.Collectors.counting()));

        TableColumn<Project, String> statsCol = new TableColumn<>("Tasks/Sessions");
        statsCol.setCellValueFactory(d -> {
            String pid = d.getValue().getId();
            long tc = taskCounts.getOrDefault(pid, 0L);
            long sc = sessionCounts.getOrDefault(pid, 0L);
            return new SimpleStringProperty(tc + "/" + sc);
        });
        statsCol.setPrefWidth(100);
        table.getColumns().add(statsCol);

        table.setItems(viewModel.getFiltered());
        VBox.setVgrow(table, Priority.ALWAYS);

        viewModel.load();
        statusLabel.setText("项目: " + viewModel.getProjects().size());

        getChildren().addAll(toolbar, table);
    }

    private ContextMenu createContextMenu(TableRow<Project> row) {
        ContextMenu menu = new ContextMenu();
        Menu statusMenu = new Menu("状态切换");
        for (ProjectStatus ps : ProjectStatus.values()) {
            MenuItem mi = new MenuItem(ps.getDisplayName());
            mi.setOnAction(ev -> {
                if (row.getItem() != null) viewModel.save(row.getItem().withStatus(ps));
            });
            statusMenu.getItems().add(mi);
        }
        MenuItem editItem = new MenuItem("编辑");
        editItem.setOnAction(e -> showEditDialog(row.getItem()));
        MenuItem detailItem = new MenuItem("查看详情");
        detailItem.setOnAction(e -> { if (row.getItem() != null) nav.navigateToProject(row.getItem().getId()); });
        MenuItem deleteItem = new MenuItem("删除");
        deleteItem.setOnAction(e -> {
            if (row.getItem() != null && confirmDelete(row.getItem().getName())) {
                viewModel.delete(row.getItem().getId());
            }
        });
        MenuItem openDir = new MenuItem("打开目录");
        openDir.setOnAction(e -> { if (row.getItem() != null) viewModel.openDirectory(row.getItem()); });
        MenuItem openTerm = new MenuItem("打开终端");
        openTerm.setOnAction(e -> { if (row.getItem() != null) viewModel.openTerminal(row.getItem()); });
        menu.getItems().addAll(statusMenu, editItem, detailItem, deleteItem, new SeparatorMenuItem(), openDir, openTerm);
        return menu;
    }

    private boolean confirmDelete(String name) {
        Alert alert = new Alert(Alert.AlertType.CONFIRMATION);
        alert.setTitle("确认删除");
        alert.setHeaderText("删除项目: " + name);
        alert.setContentText("此操作不可撤销。");
        return alert.showAndWait().filter(b -> b == ButtonType.OK).isPresent();
    }

    private void showEditDialog(Project existing) {
        Dialog<Project> dialog = new Dialog<>();
        if (getScene() != null) dialog.initOwner(getScene().getWindow());
        dialog.setTitle(existing == null ? "新建项目" : "编辑项目");
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));

        TextField nameField = new TextField(existing != null ? existing.getName() : "");
        nameField.setPromptText("项目名称（必填）");
        Button okBtn = (Button) dialog.getDialogPane().lookupButton(ButtonType.OK);
        okBtn.setDisable(existing == null);
        nameField.textProperty().addListener((o, old, val) -> okBtn.setDisable(val == null || val.isBlank()));
        TextField pathField = new TextField(existing != null ? existing.getPath() : "");
        pathField.setPromptText("项目路径");
        Label pathWarning = new Label();
        pathWarning.getStyleClass().add("text-sm");
        pathField.textProperty().addListener((o, old, val) -> {
            if (val != null && !val.isBlank() && !java.nio.file.Files.isDirectory(java.nio.file.Path.of(val))) {
                pathWarning.setText("路径不存在");
                pathWarning.setStyle("-fx-text-fill: #e67e22;");
            } else {
                pathWarning.setText("");
            }
        });
        TextArea descField = new TextArea(existing != null ? existing.getDescription() : "");
        descField.setPromptText("描述");
        descField.setPrefRowCount(3);
        TextField tagsField = new TextField(existing != null ? String.join(", ", existing.getTags()) : "");
        tagsField.setPromptText("标签（逗号分隔）");
        ComboBox<ProjectStatus> statusCombo = new ComboBox<>(FXCollections.observableArrayList(ProjectStatus.values()));
        statusCombo.setValue(existing != null ? existing.getStatus() : ProjectStatus.ACTIVE);

        grid.add(new Label("名称:"), 0, 0);
        grid.add(nameField, 1, 0);
        grid.add(new Label("路径:"), 0, 1);
        grid.add(pathField, 1, 1);
        grid.add(pathWarning, 1, 2);
        grid.add(new Label("描述:"), 0, 3);
        grid.add(descField, 1, 3);
        grid.add(new Label("标签:"), 0, 4);
        grid.add(tagsField, 1, 4);
        grid.add(new Label("状态:"), 0, 5);
        grid.add(statusCombo, 1, 5);
        dialog.getDialogPane().setContent(grid);

        dialog.setResultConverter(btn -> {
            if (btn != ButtonType.OK) return null;
            String tags = tagsField.getText().trim();
            java.util.List<String> tagList = tags.isEmpty() ? java.util.List.of() :
                    Arrays.stream(tags.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
            if (existing == null) {
                return Project.builder().name(nameField.getText().trim()).path(pathField.getText().trim())
                        .description(descField.getText().trim()).tags(tagList).status(statusCombo.getValue()).build();
            }
            return existing.toBuilder().name(nameField.getText().trim()).path(pathField.getText().trim())
                    .description(descField.getText().trim()).tags(tagList).status(statusCombo.getValue()).build();
        });

        dialog.showAndWait().ifPresent(p -> {
            if (p.getName() != null && !p.getName().isBlank()) viewModel.save(p);
        });
    }
}
