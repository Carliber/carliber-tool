package com.claudetool.storage;

import com.claudetool.config.AppConfig;
import com.claudetool.model.Identifiable;
import com.claudetool.util.FileUtil;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.TypeAdapter;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

public class GsonStorage implements JsonStorage {
    private static final Logger log = LoggerFactory.getLogger(GsonStorage.class);
    private final Path dataDir;
    private final Gson gson;
    private final Map<String, List<?>> cache = new ConcurrentHashMap<>();

    public GsonStorage() {
        this.dataDir = Path.of(AppConfig.getInstance().getDataDir());
        this.gson = new GsonBuilder().setPrettyPrinting()
                .registerTypeAdapter(LocalDateTime.class, new TypeAdapter<LocalDateTime>() {
                    private final DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
                    @Override public void write(JsonWriter out, LocalDateTime val) throws IOException {
                        out.value(val == null ? null : val.format(fmt));
                    }
                    @Override public LocalDateTime read(JsonReader in) throws IOException {
                        String s = in.nextString();
                        return s == null || s.isEmpty() ? null : LocalDateTime.parse(s, fmt);
                    }
                })
                .registerTypeAdapter(LocalDate.class, new TypeAdapter<LocalDate>() {
                    private final DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;
                    @Override public void write(JsonWriter out, LocalDate val) throws IOException {
                        out.value(val == null ? null : val.format(fmt));
                    }
                    @Override public LocalDate read(JsonReader in) throws IOException {
                        String s = in.nextString();
                        return s == null || s.isEmpty() ? null : LocalDate.parse(s, fmt);
                    }
                })
                .create();
        try {
            FileUtil.ensureDir(dataDir);
        } catch (IOException e) {
            log.error("Failed to create data dir", e);
        }
    }

    private Path filePath(String key) { return dataDir.resolve(key + ".json"); }

    @Override
    @SuppressWarnings("unchecked")
    public <T> List<T> loadAll(String key, Class<T> type) {
        if (cache.containsKey(key)) return new ArrayList<>((List<T>) cache.get(key));
        Path file = filePath(key);
        if (!Files.exists(file)) {
            cache.put(key, new ArrayList<>());
            return new ArrayList<>();
        }
        try {
            String json = Files.readString(file);
            Type listType = TypeToken.getParameterized(List.class, type).getType();
            List<T> items = gson.fromJson(json, listType);
            if (items == null) items = new ArrayList<>();
            cache.put(key, new ArrayList<>(items));
            return new ArrayList<>(items);
        } catch (JsonSyntaxException e) {
            log.warn("Corrupted JSON in {}, starting fresh: {}", key, e.getMessage());
            cache.put(key, new ArrayList<>());
            return new ArrayList<>();
        } catch (IOException e) {
            log.error("Failed to load {}", key, e);
            return new ArrayList<>();
        }
    }

    @Override
    public <T> void saveAll(String key, List<T> items) {
        cache.put(key, new ArrayList<>(items));
        writeToFile(key, items);
    }

    @Override
    public <T> Optional<T> findById(String key, Class<T> type, String id) {
        List<T> items = loadAll(key, type);
        return items.stream().filter(i -> i instanceof Identifiable ident && ident.getId().equals(id)).findFirst();
    }

    @Override
    @SuppressWarnings("unchecked")
    public <T> T save(String key, Class<T> type, T item) {
        List<T> items = loadAll(key, type);
        String newId = (item instanceof Identifiable ident) ? ident.getId() : null;

        int idx = -1;
        for (int i = 0; i < items.size(); i++) {
            if (items.get(i) instanceof Identifiable ident && ident.getId().equals(newId)) {
                idx = i;
                break;
            }
        }

        if (idx >= 0) items.set(idx, item);
        else items.add(item);

        saveAll(key, items);
        return item;
    }

    @Override
    public <T> boolean deleteById(String key, Class<T> type, String id) {
        List<T> items = loadAll(key, type);
        boolean removed = items.removeIf(i -> i instanceof Identifiable ident && ident.getId().equals(id));
        if (removed) saveAll(key, items);
        return removed;
    }

    @Override
    public void backup(String targetPath) {
        try {
            Path target = Path.of(targetPath);
            FileUtil.ensureDir(target);
            for (String key : List.of("projects", "sessions", "tasks")) {
                Path src = filePath(key);
                if (Files.exists(src)) Files.copy(src, target.resolve(key + ".json"));
            }
        } catch (IOException e) {
            log.error("Backup failed", e);
        }
    }

    @Override
    public void restore(String sourcePath) {
        cache.clear();
        try {
            Path source = Path.of(sourcePath);
            for (String key : List.of("projects", "sessions", "tasks")) {
                Path src = source.resolve(key + ".json");
                if (Files.exists(src)) Files.copy(src, filePath(key), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            log.error("Restore failed", e);
        }
    }

    private <T> void writeToFile(String key, List<T> items) {
        try {
            FileUtil.atomicWrite(filePath(key), gson.toJson(items));
        } catch (IOException e) {
            log.error("Failed to write {}", key, e);
        }
    }
}
