package com.claudetool.viewmodel;

import com.claudetool.model.Project;
import com.claudetool.model.ProjectStats;
import com.claudetool.model.ProjectStatus;
import com.claudetool.model.Session;
import com.claudetool.model.Task;
import com.claudetool.storage.JsonStorage;
import com.claudetool.util.DesktopUtil;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ProjectListViewModel {
    private static final String KEY = "projects";
    private final JsonStorage storage;
    private final ObservableList<Project> projects = FXCollections.observableArrayList();
    private final FilteredList<Project> filtered = new FilteredList<>(projects);

    public ProjectListViewModel(JsonStorage storage) {
        this.storage = storage;
    }

    public void load() {
        List<Project> list = storage.loadAll(KEY, Project.class);
        list.sort(java.util.Comparator.comparing(Project::getUpdatedAt).reversed());
        projects.setAll(list);
    }

    public void save(Project project) {
        storage.save(KEY, Project.class, project);
        load();
    }

    public boolean delete(String id) {
        boolean ok = storage.deleteById(KEY, Project.class, id);
        if (ok) load();
        return ok;
    }

    public void filter(String query, ProjectStatus status) {
        filtered.setPredicate(p -> {
            boolean matchQuery = query == null || query.isEmpty() ||
                    p.getName().toLowerCase().contains(query.toLowerCase()) ||
                    p.getPath().toLowerCase().contains(query.toLowerCase()) ||
                    p.getDescription().toLowerCase().contains(query.toLowerCase());
            boolean matchStatus = status == null || p.getStatus() == status;
            return matchQuery && matchStatus;
        });
    }

    public void openDirectory(Project p) { DesktopUtil.openDirectory(p.getPath()); }
    public void openTerminal(Project p) { DesktopUtil.openTerminal(p.getPath()); }

    public FilteredList<Project> getFiltered() { return filtered; }
    public ObservableList<Project> getProjects() { return projects; }

    public Map<String, ProjectStats> loadProjectStats() {
        Map<String, Long> taskCounts = new HashMap<>();
        storage.loadAll("tasks", Task.class).forEach(t -> {
            String pid = t.getProjectId() != null ? t.getProjectId() : "";
            taskCounts.merge(pid, 1L, Long::sum);
        });
        Map<String, Long> sessionCounts = new HashMap<>();
        storage.loadAll("sessions", Session.class).forEach(s -> {
            String pid = s.getProjectId() != null ? s.getProjectId() : "";
            sessionCounts.merge(pid, 1L, Long::sum);
        });
        Map<String, ProjectStats> stats = new HashMap<>();
        for (Project p : projects) {
            stats.put(p.getId(), new ProjectStats(
                    taskCounts.getOrDefault(p.getId(), 0L),
                    sessionCounts.getOrDefault(p.getId(), 0L)));
        }
        return stats;
    }
}
