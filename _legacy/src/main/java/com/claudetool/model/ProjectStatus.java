package com.claudetool.model;

public enum ProjectStatus {
    ACTIVE("活跃"), PAUSED("暂停"), COMPLETED("已完成"), ARCHIVED("归档");
    private final String displayName;
    ProjectStatus(String displayName) { this.displayName = displayName; }
    public String getDisplayName() { return displayName; }
}
