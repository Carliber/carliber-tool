package com.claudetool.model;

import com.claudetool.util.DateTimeUtil;
import com.claudetool.util.IdGenerator;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class Session implements Identifiable {
    private final String id;
    private final String projectId;
    private final String title;
    private final SessionTag tag;
    private final String notes;
    private final List<String> keyDecisions;
    private final LocalDateTime startedAt;
    private final LocalDateTime endedAt;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public Session(String id, String projectId, String title, SessionTag tag,
                   String notes, List<String> keyDecisions,
                   LocalDateTime startedAt, LocalDateTime endedAt,
                   LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.projectId = projectId;
        this.title = title;
        this.tag = tag;
        this.notes = notes;
        this.keyDecisions = keyDecisions != null ? Collections.unmodifiableList(new ArrayList<>(keyDecisions)) : List.of();
        this.startedAt = startedAt;
        this.endedAt = endedAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static Builder builder() { return new Builder(); }
    public Builder toBuilder() {
        return new Builder().id(id).projectId(projectId).title(title).tag(tag)
                .notes(notes).keyDecisions(keyDecisions).startedAt(startedAt).endedAt(endedAt)
                .createdAt(createdAt).updatedAt(updatedAt);
    }

    public String getId() { return id; }
    public String getProjectId() { return projectId; }
    public String getTitle() { return title; }
    public SessionTag getTag() { return tag; }
    public String getNotes() { return notes; }
    public List<String> getKeyDecisions() { return keyDecisions; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public LocalDateTime getEndedAt() { return endedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public static class Builder {
        private String id;
        private String projectId;
        private String title;
        private SessionTag tag = SessionTag.OTHER;
        private String notes = "";
        private List<String> keyDecisions = List.of();
        private LocalDateTime startedAt;
        private LocalDateTime endedAt;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public Builder id(String id) { this.id = id; return this; }
        public Builder projectId(String pid) { this.projectId = pid; return this; }
        public Builder title(String t) { this.title = t; return this; }
        public Builder tag(SessionTag t) { this.tag = t; return this; }
        public Builder notes(String n) { this.notes = n; return this; }
        public Builder keyDecisions(List<String> d) { this.keyDecisions = d; return this; }
        public Builder startedAt(LocalDateTime t) { this.startedAt = t; return this; }
        public Builder endedAt(LocalDateTime t) { this.endedAt = t; return this; }
        public Builder createdAt(LocalDateTime t) { this.createdAt = t; return this; }
        public Builder updatedAt(LocalDateTime t) { this.updatedAt = t; return this; }

        public Session build() {
            if (id == null) id = IdGenerator.generate();
            if (startedAt == null) startedAt = DateTimeUtil.now();
            if (createdAt == null) createdAt = DateTimeUtil.now();
            if (updatedAt == null) updatedAt = createdAt;
            return new Session(id, projectId, title, tag, notes, keyDecisions, startedAt, endedAt, createdAt, updatedAt);
        }
    }
}
