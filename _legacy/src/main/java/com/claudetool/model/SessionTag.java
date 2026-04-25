package com.claudetool.model;

public enum SessionTag {
    QUESTION("问题"), BUG("Bug"), FEATURE("功能"), REFACTOR("重构"), OTHER("其他");
    private final String displayName;
    SessionTag(String displayName) { this.displayName = displayName; }
    public String getDisplayName() { return displayName; }
}
