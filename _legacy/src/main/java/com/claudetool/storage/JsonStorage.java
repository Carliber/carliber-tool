package com.claudetool.storage;

import java.util.List;
import java.util.Optional;

public interface JsonStorage {
    <T> List<T> loadAll(String key, Class<T> type);
    <T> void saveAll(String key, List<T> items);
    <T> Optional<T> findById(String key, Class<T> type, String id);
    <T> T save(String key, Class<T> type, T item);
    <T> boolean deleteById(String key, Class<T> type, String id);
    void backup(String targetPath);
    void restore(String sourcePath);
}
