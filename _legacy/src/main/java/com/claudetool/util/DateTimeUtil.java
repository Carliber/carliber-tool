package com.claudetool.util;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class DateTimeUtil {
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public static String formatDisplay(LocalDateTime dt) {
        return dt == null ? "" : dt.format(DISPLAY);
    }

    public static String formatIso(LocalDateTime dt) {
        return dt == null ? "" : dt.format(ISO);
    }

    public static LocalDateTime parseIso(String s) {
        return s == null || s.isEmpty() ? null : LocalDateTime.parse(s, ISO);
    }

    public static LocalDateTime now() {
        return LocalDateTime.now();
    }
}
