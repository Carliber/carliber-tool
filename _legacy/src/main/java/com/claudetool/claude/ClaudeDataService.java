package com.claudetool.claude;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

public class ClaudeDataService {
    private static final Logger log = LoggerFactory.getLogger(ClaudeDataService.class);
    private static final String CLAUDE_DIR = System.getProperty("user.home") + "/.claude";
    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    public String getClaudeDir() { return CLAUDE_DIR; }

    public boolean isClaudeAvailable() {
        return Files.exists(Path.of(CLAUDE_DIR));
    }

    public String getGlobalClaudeMd() {
        return readFile(Path.of(CLAUDE_DIR, "CLAUDE.md"));
    }

    public void saveGlobalClaudeMd(String content) {
        writeFile(Path.of(CLAUDE_DIR, "CLAUDE.md"), content);
    }

    public JsonObject getSettings() {
        String json = readFile(Path.of(CLAUDE_DIR, "settings.json"));
        return json.isEmpty() ? new JsonObject() : gson.fromJson(json, JsonObject.class);
    }

    public void saveSettings(JsonObject settings) {
        writeFile(Path.of(CLAUDE_DIR, "settings.json"), gson.toJson(settings));
    }

    public List<ClaudeProject> discoverProjects() {
        List<ClaudeProject> projects = new ArrayList<>();
        Path projectsDir = Path.of(CLAUDE_DIR, "projects");
        if (!Files.exists(projectsDir)) return projects;
        try (Stream<Path> dirs = Files.list(projectsDir)) {
            dirs.filter(Files::isDirectory).forEach(dir -> {
                String dirName = dir.getFileName().toString();
                String projectPath = "";
                Path indexPath = dir.resolve("sessions-index.json");
                if (Files.exists(indexPath)) {
                    try {
                        JsonObject index = gson.fromJson(Files.readString(indexPath), JsonObject.class);
                        if (index.has("originalPath")) projectPath = index.get("originalPath").getAsString();
                    } catch (IOException e) { log.warn("Failed to read jsonl session", e); }
                }
                if (projectPath.isEmpty()) {
                    projectPath = extractCwdFromJsonl(dir);
                }
                long sessionCount = 0;
                try (Stream<Path> files = Files.list(dir)) {
                    sessionCount = files.filter(f -> f.toString().endsWith(".jsonl")).count();
                } catch (IOException e) { log.warn("Failed to read jsonl session", e); }
                if (sessionCount > 0 || Files.exists(indexPath)) {
                    projects.add(new ClaudeProject(dirName, projectPath, dir.toString(), (int) sessionCount));
                }
            });
        } catch (IOException e) {
            log.error("Failed to list projects", e);
        }
        return projects;
    }

    public List<ClaudeSession> getProjectSessions(String projectDirName) {
        List<ClaudeSession> sessions = new ArrayList<>();
        Path projectDir = Path.of(CLAUDE_DIR, "projects", projectDirName);

        Path indexPath = projectDir.resolve("sessions-index.json");
        if (Files.exists(indexPath)) {
            try {
                JsonObject index = gson.fromJson(Files.readString(indexPath), JsonObject.class);
                if (index.has("entries")) {
                    for (var entry : index.getAsJsonArray("entries")) {
                        JsonObject e = entry.getAsJsonObject();
                        sessions.add(new ClaudeSession(
                                getStr(e, "sessionId"), getStr(e, "firstPrompt"), getStr(e, "summary"),
                                getInt(e, "messageCount"), getStr(e, "gitBranch"), getStr(e, "projectPath"),
                                getStr(e, "created"), getStr(e, "modified"), getBool(e, "isSidechain")));
                    }
                    return sessions;
                }
            } catch (IOException e) { log.warn("Failed to list sessions", e); }
        }

        try (Stream<Path> files = Files.list(projectDir)) {
            files.filter(f -> f.toString().endsWith(".jsonl")).forEach(f -> {
                String sessionId = f.getFileName().toString().replace(".jsonl", "");
                String firstPrompt = "";
                String created = "";
                try {
                    List<String> lines = Files.readAllLines(f);
                    for (String line : lines) {
                        if (line.trim().isEmpty()) continue;
                        try {
                            JsonObject obj = gson.fromJson(line, JsonObject.class);
                            if (obj.has("attachment") && obj.get("attachment").isJsonObject()) {
                                JsonObject att = obj.getAsJsonObject("attachment");
                                if (att.has("content") && !att.get("content").isJsonNull()) {
                                    String content = att.get("content").getAsString();
                                    if (content.length() > 5 && firstPrompt.isEmpty()) {
                                        firstPrompt = content.length() > 200 ? content.substring(0, 200) + "..." : content;
                                    }
                                }
                            }
                            if (obj.has("timestamp")) {
                                String ts = obj.get("timestamp").getAsString();
                                if (created.isEmpty() && ts.length() >= 10) created = ts.substring(0, 10);
                            }
                        } catch (Exception e) { log.debug("Skipping non-JSON line", e); }
                    }
                    if (firstPrompt.isEmpty()) firstPrompt = "(" + lines.size() + " events)";
                    if (created.isEmpty() && !lines.isEmpty()) {
                        long mtime = Files.getLastModifiedTime(f).toMillis();
                        created = LocalDateTime.ofInstant(Instant.ofEpochMilli(mtime), ZoneId.systemDefault())
                                .format(DateTimeFormatter.ISO_LOCAL_DATE);
                    }
                } catch (IOException e) { log.warn("Failed to read jsonl session", e); }
                sessions.add(new ClaudeSession(sessionId, firstPrompt, "", 0, "", "", created, "", false));
            });
        } catch (IOException e) { log.warn("Failed to list sessions", e); }

        return sessions;
    }

    private String extractCwdFromJsonl(Path projectDir) {
        try (Stream<Path> files = Files.list(projectDir)) {
            Optional<Path> firstJsonl = files.filter(f -> f.toString().endsWith(".jsonl")).findFirst();
            if (firstJsonl.isEmpty()) return projectDir.getFileName().toString();
            for (String line : Files.readAllLines(firstJsonl.get())) {
                if (line.trim().isEmpty()) continue;
                try {
                    JsonObject obj = gson.fromJson(line, JsonObject.class);
                    if (obj.has("cwd")) return obj.get("cwd").getAsString();
                } catch (Exception ignored) {}
            }
        } catch (IOException ignored) {}
        return projectDir.getFileName().toString();
    }

    public ClaudeStats getStats() {
        Path statsFile = Path.of(CLAUDE_DIR, "stats-cache.json");
        if (!Files.exists(statsFile)) return new ClaudeStats(0, 0, Map.of(), List.of());
        try {
            JsonObject obj = gson.fromJson(Files.readString(statsFile), JsonObject.class);
            int totalSessions = getInt(obj, "totalSessions");
            int totalMessages = getInt(obj, "totalMessages");
            Map<String, ModelUsage> modelUsage = obj.has("modelUsage") ? parseModelUsage(obj.getAsJsonObject("modelUsage")) : Map.of();
            List<DailyActivity> daily = obj.has("dailyActivity") ? parseDaily(obj.getAsJsonArray("dailyActivity")) : List.of();
            return new ClaudeStats(totalSessions, totalMessages, modelUsage, daily);
        } catch (IOException e) {
            return new ClaudeStats(0, 0, Map.of(), List.of());
        }
    }

    public List<ActiveSession> getActiveSessions() {
        List<ActiveSession> sessions = new ArrayList<>();
        Path dir = Path.of(CLAUDE_DIR, "sessions");
        if (!Files.exists(dir)) return sessions;
        try (Stream<Path> files = Files.list(dir)) {
            files.filter(f -> f.toString().endsWith(".json")).forEach(f -> {
                try {
                    JsonObject o = gson.fromJson(Files.readString(f), JsonObject.class);
                    sessions.add(new ActiveSession(getInt(o, "pid"), getStr(o, "sessionId"),
                            getStr(o, "cwd"), getStr(o, "version"), getLong(o, "startedAt"), getStr(o, "name")));
                } catch (IOException e) { log.warn("Failed to read jsonl session", e); }
            });
        } catch (IOException e) { log.warn("Failed to list sessions", e); }
        return sessions;
    }

    public List<String> listPlans() {
        List<String> plans = new ArrayList<>();
        Path dir = Path.of(CLAUDE_DIR, "plans");
        if (!Files.exists(dir)) return plans;
        try (Stream<Path> files = Files.list(dir)) {
            files.filter(f -> f.toString().endsWith(".md")).forEach(f -> plans.add(f.getFileName().toString()));
        } catch (IOException e) { log.warn("Failed to list sessions", e); }
        return plans;
    }

    public String readPlan(String name) {
        Path target = Path.of(CLAUDE_DIR, "plans", name).normalize().toAbsolutePath();
        Path base = Path.of(CLAUDE_DIR, "plans").normalize().toAbsolutePath();
        if (!target.startsWith(base)) return "";
        return readFile(target);
    }

    public List<String> listRules() {
        List<String> rules = new ArrayList<>();
        Path dir = Path.of(CLAUDE_DIR, "rules");
        if (!Files.exists(dir)) return rules;
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.filter(f -> f.toString().endsWith(".md"))
                    .forEach(f -> rules.add(dir.relativize(f).toString().replace('\\', '/')));
        } catch (IOException e) { log.warn("Failed to list sessions", e); }
        return rules;
    }

    public String readRule(String relativePath) {
        Path target = Path.of(CLAUDE_DIR, "rules", relativePath).normalize().toAbsolutePath();
        Path base = Path.of(CLAUDE_DIR, "rules").normalize().toAbsolutePath();
        if (!target.startsWith(base)) return "";
        return readFile(target);
    }

    private Map<String, ModelUsage> parseModelUsage(JsonObject obj) {
        Map<String, ModelUsage> map = new LinkedHashMap<>();
        for (var entry : obj.entrySet()) {
            JsonObject m = entry.getValue().getAsJsonObject();
            map.put(entry.getKey(), new ModelUsage(getLong(m, "inputTokens"), getLong(m, "outputTokens"),
                    getDouble(m, "costUSD"), getLong(m, "cacheReadInputTokens"), getLong(m, "cacheCreationInputTokens")));
        }
        return map;
    }

    private List<DailyActivity> parseDaily(com.google.gson.JsonArray arr) {
        List<DailyActivity> list = new ArrayList<>();
        for (var e : arr) {
            JsonObject o = e.getAsJsonObject();
            list.add(new DailyActivity(getStr(o, "date"), getInt(o, "messageCount"),
                    getInt(o, "sessionCount"), getInt(o, "toolCallCount")));
        }
        return list;
    }

    private String readFile(Path path) {
        try { return Files.exists(path) ? Files.readString(path) : ""; }
        catch (IOException e) { return ""; }
    }

    private void writeFile(Path path, String content) {
        try { Files.writeString(path, content); } catch (IOException e) { log.error("Write failed: {}", path, e); }
    }

    private String getStr(JsonObject o, String k) { return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsString() : ""; }
    private int getInt(JsonObject o, String k) { return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsInt() : 0; }
    private long getLong(JsonObject o, String k) { return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsLong() : 0L; }
    private double getDouble(JsonObject o, String k) { return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsDouble() : 0.0; }
    private boolean getBool(JsonObject o, String k) { return o.has(k) && !o.get(k).isJsonNull() && o.get(k).getAsBoolean(); }

    public record ClaudeProject(String dirName, String projectPath, String fullPath, int sessionCount) {}
    public record ClaudeSession(String sessionId, String firstPrompt, String summary, int messageCount,
                                String gitBranch, String projectPath, String created, String modified, boolean isSidechain) {}
    public record ClaudeStats(int totalSessions, int totalMessages, Map<String, ModelUsage> modelUsage, List<DailyActivity> dailyActivity) {}
    public record ModelUsage(long inputTokens, long outputTokens, double costUSD, long cacheReadTokens, long cacheCreationTokens) {}
    public record DailyActivity(String date, int messageCount, int sessionCount, int toolCallCount) {}
    public record ActiveSession(int pid, String sessionId, String cwd, String version, long startedAt, String name) {}
    public record ChatMessage(String role, String content, String timestamp) {}

    public List<ChatMessage> readSessionMessages(String projectDirName, String sessionId) {
        List<ChatMessage> messages = new ArrayList<>();
        Path file = Path.of(CLAUDE_DIR, "projects", projectDirName, sessionId + ".jsonl");
        if (!Files.exists(file)) return messages;
        try {
            for (String line : Files.readAllLines(file)) {
                if (line.trim().isEmpty()) continue;
                try {
                    JsonObject obj = gson.fromJson(line, JsonObject.class);
                    String role = "";
                    String content = "";
                    String ts = getStr(obj, "timestamp");
                    if (obj.has("type")) {
                        String type = obj.get("type").getAsString();
                        if ("human".equals(type)) role = "user";
                        else if ("assistant".equals(type)) role = "assistant";
                        else if ("tool_result".equals(type)) role = "tool";
                        else continue;
                    }
                    if (obj.has("message") && obj.get("message").isJsonObject()) {
                        JsonObject msg = obj.getAsJsonObject("message");
                        if (msg.has("role")) role = msg.get("role").getAsString();
                        content = extractContent(msg);
                    } else if (obj.has("attachment") && obj.get("attachment").isJsonObject()) {
                        JsonObject att = obj.getAsJsonObject("attachment");
                        content = getStr(att, "content");
                        if (content.isEmpty()) content = getStr(att, "name");
                    }
                    if (!content.isEmpty()) {
                        if (content.length() > 2000) content = content.substring(0, 2000) + "...";
                        messages.add(new ChatMessage(role, content, ts));
                    }
                } catch (Exception ignored) {}
            }
        } catch (IOException e) { log.warn("Failed to read session messages", e); }
        return messages;
    }

    private String extractContent(JsonObject msg) {
        if (!msg.has("content")) return "";
        var c = msg.get("content");
        if (c.isJsonPrimitive()) return c.getAsString();
        if (c.isJsonArray()) {
            StringBuilder sb = new StringBuilder();
            for (var el : c.getAsJsonArray()) {
                if (el.isJsonPrimitive()) { sb.append(el.getAsString()); }
                else if (el.isJsonObject()) {
                    JsonObject o = el.getAsJsonObject();
                    String type = getStr(o, "type");
                    if ("text".equals(type)) sb.append(getStr(o, "text"));
                    else if ("tool_use".equals(type)) sb.append("[Tool: ").append(getStr(o, "name")).append("]");
                    else if ("tool_result".equals(type)) sb.append(getStr(o, "content"));
                }
            }
            return sb.toString();
        }
        return "";
    }
}
