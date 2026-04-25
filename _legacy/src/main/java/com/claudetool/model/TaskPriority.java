package com.claudetool.model;

public enum TaskPriority {
    URGENT("紧急"), HIGH("高"), MEDIUM("中"), LOW("低");
    private final String displayName;
    TaskPriority(String displayName) { this.displayName = displayName; }
    public String getDisplayName() { return displayName; }
}
