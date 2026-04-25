package com.claudetool.view;

import com.claudetool.config.AppConfig;
import com.claudetool.model.Project;
import com.claudetool.model.Session;
import com.claudetool.model.Task;
import com.claudetool.storage.GsonStorage;
import javafx.geometry.Insets;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;

import java.io.File;

public class SettingsView extends VBox {
    private final AppConfig config = AppConfig.getInstance();

    public SettingsView() {
        setSpacing(15);
        setPadding(new Insets(20));

        Label title = new Label("设置");
        title.getStyleClass().add("title-lg");

        getChildren().addAll(title, new Separator(), createGeneralSection(), new Separator(),
                createWindowSection(), new Separator(), createClaudeSection(), new Separator(),
                createBackupSection(), new Separator(), createStatsSection(), new Separator(), createAboutSection());
    }

    private VBox createGeneralSection() {
        VBox section = new VBox(10);
        Label header = new Label("通用设置");
        header.getStyleClass().add("title-sm");

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);

        ComboBox<String> themeCombo = new ComboBox<>();
        themeCombo.getItems().addAll("LIGHT", "DARK");
        themeCombo.setValue(config.getTheme());
        grid.add(new Label("主题:"), 0, 0);
        grid.add(themeCombo, 1, 0);

        TextField dataDirField = new TextField(config.getDataDir());
        dataDirField.setPrefWidth(350);
        Button changeDirBtn = new Button("浏览...");
        changeDirBtn.setOnAction(e -> {
            DirectoryChooser chooser = new DirectoryChooser();
            chooser.setTitle("选择数据目录");
            File dir = chooser.showDialog(getScene() != null ? getScene().getWindow() : null);
            if (dir != null) dataDirField.setText(dir.getAbsolutePath());
        });
        HBox dataDirBox = new HBox(5, dataDirField, changeDirBtn);
        grid.add(new Label("数据目录:"), 0, 1);
        grid.add(dataDirBox, 1, 1);

        TextField lastPageField = new TextField(config.getLastPage());
        lastPageField.setPromptText("启动页面 (projects/claude/sessions/tasks/search/settings)");
        lastPageField.setPrefWidth(350);
        grid.add(new Label("启动页面:"), 0, 2);
        grid.add(lastPageField, 1, 2);

        section.getChildren().addAll(header, grid);
        return section;
    }

    private VBox createWindowSection() {
        VBox section = new VBox(10);
        Label header = new Label("窗口设置");
        header.getStyleClass().add("title-sm");

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);

        Spinner<Integer> widthSpinner = new Spinner<>(800, 3840, config.getWindowWidth(), 10);
        widthSpinner.setEditable(true);
        widthSpinner.setPrefWidth(120);
        grid.add(new Label("窗口宽度:"), 0, 0);
        grid.add(widthSpinner, 1, 0);

        Spinner<Integer> heightSpinner = new Spinner<>(600, 2160, config.getWindowHeight(), 10);
        heightSpinner.setEditable(true);
        heightSpinner.setPrefWidth(120);
        grid.add(new Label("窗口高度:"), 0, 1);
        grid.add(heightSpinner, 1, 1);

        section.getChildren().addAll(header, grid);
        return section;
    }

    private VBox createClaudeSection() {
        VBox section = new VBox(10);
        Label header = new Label("Claude Code");
        header.getStyleClass().add("title-sm");

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);

        TextField cliPathField = new TextField(config.getClaudeCliPath());
        cliPathField.setPromptText("claude 命令行路径");
        cliPathField.setPrefWidth(350);
        Button browseBtn = new Button("浏览...");
        browseBtn.setOnAction(e -> {
            FileChooser chooser = new FileChooser();
            chooser.setTitle("选择 Claude CLI");
            File file = chooser.showOpenDialog(getScene() != null ? getScene().getWindow() : null);
            if (file != null) cliPathField.setText(file.getAbsolutePath());
        });
        HBox cliBox = new HBox(5, cliPathField, browseBtn);
        grid.add(new Label("CLI 路径:"), 0, 0);
        grid.add(cliBox, 1, 0);

        section.getChildren().addAll(header, grid);
        return section;
    }

    private VBox createBackupSection() {
        VBox section = new VBox(10);
        Label header = new Label("数据备份");
        header.getStyleClass().add("title-sm");

        HBox btnBox = new HBox(10);
        Button exportBtn = new Button("导出备份");
        exportBtn.setOnAction(e -> {
            DirectoryChooser chooser = new DirectoryChooser();
            chooser.setTitle("选择备份保存位置");
            File dir = chooser.showDialog(getScene() != null ? getScene().getWindow() : null);
            if (dir != null) {
                new GsonStorage().backup(dir.getAbsolutePath());
                Alert info = new Alert(Alert.AlertType.INFORMATION, "备份已保存到: " + dir.getAbsolutePath());
                info.show();
            }
        });

        Button importBtn = new Button("导入恢复");
        importBtn.setOnAction(e -> {
            DirectoryChooser chooser = new DirectoryChooser();
            chooser.setTitle("选择备份目录");
            File dir = chooser.showDialog(getScene() != null ? getScene().getWindow() : null);
            if (dir != null) {
                Alert confirm = new Alert(Alert.AlertType.CONFIRMATION, "导入将覆盖当前数据，确认继续？");
                confirm.showAndWait().filter(b -> b == ButtonType.OK).ifPresent(b -> {
                    new GsonStorage().restore(dir.getAbsolutePath());
                    Alert info = new Alert(Alert.AlertType.INFORMATION, "数据已恢复，请重启应用。");
                    info.show();
                });
            }
        });

        btnBox.getChildren().addAll(exportBtn, importBtn);
        section.getChildren().addAll(header, btnBox);
        return section;
    }

    private VBox createStatsSection() {
        VBox section = new VBox(10);
        Label header = new Label("数据统计");
        header.getStyleClass().add("title-sm");

        GsonStorage gsonStorage = new GsonStorage();
        int projCount = gsonStorage.loadAll("projects", Project.class).size();
        int sessCount = gsonStorage.loadAll("sessions", Session.class).size();
        int taskCount = gsonStorage.loadAll("tasks", Task.class).size();
        Label statsLabel = new Label("项目: " + projCount + " | 会话: " + sessCount + " | 任务: " + taskCount);

        section.getChildren().addAll(header, statsLabel);
        return section;
    }

    private VBox createAboutSection() {
        VBox section = new VBox(10);
        Label header = new Label("关于");
        header.getStyleClass().add("title-sm");
        Label aboutText = new Label("Claude Tool v1.0.0\nClaude Code 项目管理工具");
        section.getChildren().addAll(header, aboutText);
        return section;
    }
}
