package com.claudetool.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class DesktopUtil {
    private static final Logger log = LoggerFactory.getLogger(DesktopUtil.class);

    public static void openDirectory(String path) {
        try {
            Desktop.getDesktop().open(Path.of(path).toFile());
        } catch (IOException e) {
            log.error("Failed to open directory: {}", path, e);
        }
    }

    public static void openTerminal(String directory) {
        try {
            Path dir = Path.of(directory).toAbsolutePath();
            if (!Files.isDirectory(dir)) {
                log.warn("Directory does not exist: {}", dir);
                return;
            }
            new ProcessBuilder("cmd.exe", "/c", "start", "cmd.exe", "/K",
                    "cd /d " + dir.toString())
                .start();
        } catch (IOException e) {
            log.error("Failed to open terminal at: {}", directory, e);
        }
    }
}
