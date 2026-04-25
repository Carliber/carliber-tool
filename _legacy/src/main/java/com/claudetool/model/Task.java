package com.claudetool.model;

import com.claudetool.util.DateTimeUtil;
import com.claudetool.util.IdGenerator;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class Task implements Identifiable {
    private final String id;
    private final String projectId;
    private final String title;
    private final String description;
    private final TaskStatus status;
    private final TaskPriority priority;
    private final LocalDate dueDate;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public Task(String id, String projectId, String title, String description,
                TaskStatus status, TaskPriority priority, LocalDate dueDate,
                LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.projectId = projectId;
        this.title = title;
        this.description = description;
        this.status = status;
        this.priority = priority;
        this.dueDate = dueDate;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static Builder builder() { return new Builder(); }
    public Builder toBuilder() {
        return new Builder().id(id).projectId(projectId).title(title).description(description)
                .status(status).priority(priority).dueDate(dueDate).createdAt(createdAt).updatedAt(updatedAt);
    }

    public Task withStatus(TaskStatus s) { return toBuilder().status(s).updatedAt(DateTimeUtil.now()).build(); }

    public String getId() { return id; }
    public String getProjectId() { return projectId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public TaskStatus getStatus() { return status; }
    public TaskPriority getPriority() { return priority; }
    public LocalDate getDueDate() { return dueDate; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public static class Builder {
        private String id;
        private String projectId;
        private String title;
        private String description = "";
        private TaskStatus status = TaskStatus.TODO;
        private TaskPriority priority = TaskPriority.MEDIUM;
        private LocalDate dueDate;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public Builder id(String id) { this.id = id; return this; }
        public Builder projectId(String pid) { this.projectId = pid; return this; }
        public Builder title(String t) { this.title = t; return this; }
        public Builder description(String d) { this.description = d; return this; }
        public Builder status(TaskStatus s) { this.status = s; return this; }
        public Builder priority(TaskPriority p) { this.priority = p; return this; }
        public Builder dueDate(LocalDate d) { this.dueDate = d; return this; }
        public Builder createdAt(LocalDateTime t) { this.createdAt = t; return this; }
        public Builder updatedAt(LocalDateTime t) { this.updatedAt = t; return this; }

        public Task build() {
            if (id == null) id = IdGenerator.generate();
            if (createdAt == null) createdAt = DateTimeUtil.now();
            if (updatedAt == null) updatedAt = createdAt;
            return new Task(id, projectId, title, description, status, priority, dueDate, createdAt, updatedAt);
        }
    }
}
