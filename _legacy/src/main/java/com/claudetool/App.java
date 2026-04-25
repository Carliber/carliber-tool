package com.claudetool;

import com.claudetool.config.AppConfig;
import com.claudetool.config.ThemeManager;
import com.claudetool.tray.SystemTrayManager;
import com.claudetool.util.FileUtil;
import com.claudetool.view.MainView;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.stage.Stage;

public class App extends Application {
    private SystemTrayManager trayManager;

    @Override
    public void start(Stage primaryStage) {
        AppConfig config = AppConfig.getInstance();
        ThemeManager themeManager = ThemeManager.getInstance();
        try { FileUtil.ensureDir(java.nio.file.Path.of(config.getDataDir())); }
        catch (java.io.IOException e) { /* data dir creation will retry on first write */ }
        Platform.setImplicitExit(false);

        MainView mainView = new MainView(config, themeManager);
        Scene scene = new Scene(mainView.getRoot(), config.getWindowWidth(), config.getWindowHeight());

        scene.getStylesheets().add(getClass().getResource("/css/" + themeManager.getThemeCss()).toExternalForm());
        themeManager.setScene(scene);
        mainView.setupAccelerators(scene);
        mainView.setOnTitleChanged(title -> Platform.runLater(() -> primaryStage.setTitle(title)));

        primaryStage.setTitle("Claude Tool - 项目管理");
        primaryStage.setScene(scene);
        primaryStage.setMinWidth(960);
        primaryStage.setMinHeight(600);
        if (config.getWindowX() >= 0 && config.getWindowY() >= 0) {
            primaryStage.setX(config.getWindowX());
            primaryStage.setY(config.getWindowY());
        }

        trayManager = new SystemTrayManager();
        trayManager.setOnShow(() -> Platform.runLater(() -> {
            primaryStage.show();
            primaryStage.toFront();
        }));
        trayManager.setOnExit(() -> {
            trayManager.remove();
            Platform.runLater(Platform::exit);
        });

        Runnable saveWindowState = () -> {
            config.setWindowWidth((int) scene.getWidth());
            config.setWindowHeight((int) scene.getHeight());
            config.setWindowX((int) primaryStage.getX());
            config.setWindowY((int) primaryStage.getY());
            config.save();
        };

        if (trayManager.isSupported()) {
            trayManager.install();
            primaryStage.setOnCloseRequest(e -> {
                e.consume();
                saveWindowState.run();
                primaryStage.hide();
            });
        } else {
            primaryStage.setOnCloseRequest(e -> saveWindowState.run());
        }

        primaryStage.show();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
