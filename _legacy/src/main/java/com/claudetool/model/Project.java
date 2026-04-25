package com.claudetool.model;

import com.claudetool.util.DateTimeUtil;
import com.claudetool.util.IdGenerator;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class Project implements Identifiable {
    private final String id;
    private final String name;
    private final String path;
    private final String description;
    private final List<String> tags;
    private final ProjectStatus status;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public Project(String id, String name, String path, String description,
                   List<String> tags, ProjectStatus status,
                   LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.name = name;
        this.path = path;
        this.description = description;
        this.tags = tags != null ? Collections.unmodifiableList(new ArrayList<>(tags)) : List.of();
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static Builder builder() { return new Builder(); }

    public Builder toBuilder() {
        return new Builder().id(id).name(name).path(path).description(description)
                .tags(tags).status(status).createdAt(createdAt).updatedAt(updatedAt);
    }

    public Project withName(String n) { return toBuilder().name(n).updatedAt(DateTimeUtil.now()).build(); }
    public Project withStatus(ProjectStatus s) { return toBuilder().status(s).updatedAt(DateTimeUtil.now()).build(); }
    public Project withUpdatedAt(LocalDateTime t) { return toBuilder().updatedAt(t).build(); }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getPath() { return path; }
    public String getDescription() { return description; }
    public List<String> getTags() { return tags; }
    public ProjectStatus getStatus() { return status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public static class Builder {
        private String id;
        private String name;
        private String path;
        private String description = "";
        private List<String> tags = List.of();
        private ProjectStatus status = ProjectStatus.ACTIVE;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public Builder id(String id) { this.id = id; return this; }
        public Builder name(String name) { this.name = name; return this; }
        public Builder path(String path) { this.path = path; return this; }
        public Builder description(String d) { this.description = d; return this; }
        public Builder tags(List<String> t) { this.tags = t; return this; }
        public Builder status(ProjectStatus s) { this.status = s; return this; }
        public Builder createdAt(LocalDateTime t) { this.createdAt = t; return this; }
        public Builder updatedAt(LocalDateTime t) { this.updatedAt = t; return this; }

        public Project build() {
            if (id == null) id = IdGenerator.generate();
            if (createdAt == null) createdAt = DateTimeUtil.now();
            if (updatedAt == null) updatedAt = createdAt;
            return new Project(id, name, path, description, tags, status, createdAt, updatedAt);
        }
    }
}
