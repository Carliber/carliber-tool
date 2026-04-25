package com.claudetool.viewmodel;

import com.claudetool.model.Session;
import com.claudetool.model.SessionTag;
import com.claudetool.storage.JsonStorage;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;

import java.util.Comparator;
import java.util.List;

public class SessionListViewModel {
    private static final String KEY = "sessions";
    private final JsonStorage storage;
    private final ObservableList<Session> sessions = FXCollections.observableArrayList();
    private final FilteredList<Session> filtered = new FilteredList<>(sessions.sorted(Comparator.comparing(Session::getCreatedAt).reversed()));

    public SessionListViewModel(JsonStorage storage) {
        this.storage = storage;
    }

    public void load() {
        List<Session> loaded = storage.loadAll(KEY, Session.class);
        loaded.sort(Comparator.comparing(Session::getCreatedAt).reversed());
        sessions.setAll(loaded);
    }

    public void save(Session session) {
        storage.save(KEY, Session.class, session);
        load();
    }

    public boolean delete(String id) {
        boolean ok = storage.deleteById(KEY, Session.class, id);
        if (ok) load();
        return ok;
    }

    public void filter(String query, String projectId, SessionTag tag) {
        filtered.setPredicate(s -> {
            boolean mq = query == null || query.isEmpty() ||
                    s.getTitle().toLowerCase().contains(query.toLowerCase()) ||
                    s.getNotes().toLowerCase().contains(query.toLowerCase());
            boolean mp = projectId == null || projectId.isEmpty() || projectId.equals(s.getProjectId());
            boolean mt = tag == null || s.getTag() == tag;
            return mq && mp && mt;
        });
    }

    public FilteredList<Session> getFiltered() { return filtered; }
}
