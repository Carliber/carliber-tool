package com.claudetool.viewmodel;

import com.claudetool.model.Task;
import com.claudetool.model.TaskPriority;
import com.claudetool.model.TaskStatus;
import com.claudetool.storage.JsonStorage;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

public class TaskBoardViewModel {
    private static final String KEY = "tasks";
    private final JsonStorage storage;
    private final ObservableList<Task> allTasks = FXCollections.observableArrayList();
    private final ObservableList<Task> todoTasks = FXCollections.observableArrayList();
    private final ObservableList<Task> inProgressTasks = FXCollections.observableArrayList();
    private final ObservableList<Task> doneTasks = FXCollections.observableArrayList();
    private String projectIdFilter;
    private TaskPriority priorityFilter;
    private Comparator<Task> sorter;

    public static final Comparator<Task> SORT_PRIORITY = Comparator.comparingInt(t -> t.getPriority().ordinal());
    public static final Comparator<Task> SORT_DUE_DATE = Comparator.comparing(t -> t.getDueDate() != null ? t.getDueDate() : LocalDate.MAX);
    public static final Comparator<Task> SORT_CREATED = Comparator.comparing(Task::getCreatedAt).reversed();

    public TaskBoardViewModel(JsonStorage storage) {
        this.storage = storage;
    }

    public void load() {
        allTasks.setAll(storage.loadAll(KEY, Task.class));
        applyFilters();
    }

    public void save(Task task) {
        storage.save(KEY, Task.class, task);
        load();
    }

    public boolean delete(String id) {
        boolean ok = storage.deleteById(KEY, Task.class, id);
        if (ok) load();
        return ok;
    }

    public void moveTask(String taskId, TaskStatus newStatus) {
        allTasks.stream().filter(t -> t.getId().equals(taskId)).findFirst().ifPresent(t -> {
            save(t.withStatus(newStatus));
        });
    }

    public void applyFilters() {
        List<Task> filtered = allTasks.stream()
                .filter(t -> projectIdFilter == null || projectIdFilter.isEmpty() || projectIdFilter.equals(t.getProjectId()))
                .filter(t -> priorityFilter == null || t.getPriority() == priorityFilter)
                .collect(Collectors.toList());
        if (sorter != null) filtered.sort(sorter);
        todoTasks.setAll(filtered.stream().filter(t -> t.getStatus() == TaskStatus.TODO).collect(Collectors.toList()));
        inProgressTasks.setAll(filtered.stream().filter(t -> t.getStatus() == TaskStatus.IN_PROGRESS).collect(Collectors.toList()));
        doneTasks.setAll(filtered.stream().filter(t -> t.getStatus() == TaskStatus.DONE).collect(Collectors.toList()));
    }

    public void setProjectIdFilter(String pid) { this.projectIdFilter = pid; }
    public void setPriorityFilter(TaskPriority p) { this.priorityFilter = p; }
    public void setSorter(Comparator<Task> s) { this.sorter = s; }

    public ObservableList<Task> getTodoTasks() { return todoTasks; }
    public ObservableList<Task> getInProgressTasks() { return inProgressTasks; }
    public ObservableList<Task> getDoneTasks() { return doneTasks; }
    public ObservableList<Task> getAllTasks() { return allTasks; }
}
