package com.smarthotel.ai.assistant.v2.service;

import java.util.*;
import java.util.regex.Pattern;

/** Resolves positions against the displayed roster, never against search ranking. */
final class OptionReferences {
    private OptionReferences() {}
    private static final int LAST = Integer.MAX_VALUE;
    private static final String NUMBER = "(?:dau tien|thu nhat|cuoi cung|nhat|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi|cuoi|\\d{1,3})";
    private static final String END = "\\b(?!\\s*(?:sao|nguoi|tre|trieu|nghin|ngan|dem|ngay|phong|khach san)\\b)";
    private static final String LABEL = "(?:khach san|ks|loai phong|phong|lua chon|phuong an|cai|thu|so|#)";
    private static final Pattern SINGLE = Pattern.compile("(?:\\b" + LABEL + "|#)\\s*(?:(?:thu|so)\\s*)?(" + NUMBER + ")" + END);
    private static final Pattern LIST = Pattern.compile("\\b" + NUMBER + "(?:\\s*(?:,|&|;|\\bva\\b|\\bvoi\\b|\\bvs\\b)\\s*(?:" + LABEL + "\\s*)?(?:(?:thu|so)\\s*)?" + NUMBER + ")+" + END);
    private static final Pattern TOKEN = Pattern.compile("\\b" + NUMBER + "\\b");
    private static final Pattern FIRST = Pattern.compile("\\b(" + NUMBER + ")\\s+(?:khach san|loai phong|phong|lua chon|phuong an)\\s+dau(?: tien)?\\b");
    private static final Pattern COUNT = Pattern.compile("\\b(" + NUMBER + ")\\s+(?:khach san|loai phong|phong|lua chon|phuong an)\\b");

    static boolean wholeRoster(String message) {
        String text=SystemKnowledgeService.normalize(message);
        return text.matches(".*\\b(ca|tat ca|toan bo)\\s+(?:(?:"+NUMBER+"|cac|nhung)\\s+)?(?:khach san|loai phong|phong|lua chon|phuong an)\\b.*")
                || text.matches(".*\\b(?:khach san|lua chon|phuong an)\\s+(?:vua|da)\\s+(?:gioi thieu|goi y)\\b.*");
    }

    static boolean hasCount(String message) { return COUNT.matcher(SystemKnowledgeService.normalize(message)).find(); }
    static boolean explicitPositions(String message) {
        String text=SystemKnowledgeService.normalize(message);
        return SINGLE.matcher(text).find() || LIST.matcher(text).find() || FIRST.matcher(text).find();
    }

    static boolean comparisonRequested(String message) {
        String text = SystemKnowledgeService.normalize(message);
        return text.matches(".*\\b(so sanh|compare|doi chieu|khac nhau|khac gi|hon kem|versus|vs)\\b.*")
                && !text.matches(".*\\b(khong|dung)\\s+(?:(?:can|muon)\\s+)?(?:so sanh|compare|doi chieu)\\b.*");
    }

    static boolean alternativesRequested(String message) {
        return !comparisonRequested(message) && SystemKnowledgeService.normalize(message)
                .matches(".*\\b(khac|them|nua|tiep|other|another|more)\\b.*");
    }

    static List<Integer> positions(String message) {
        String text = SystemKnowledgeService.normalize(message);
        var first = FIRST.matcher(text);
        if (first.find()) {
            int count = number(first.group(1)) + 1;
            if (count > 0 && count <= 100) return java.util.stream.IntStream.range(0, count).boxed().toList();
            return List.of(-1);
        }
        record Located(int at, int index) {}
        List<Located> found = new ArrayList<>();
        var single = SINGLE.matcher(text);
        while (single.find()) found.add(new Located(single.start(1), number(single.group(1))));
        var list = LIST.matcher(text);
        while (list.find()) {
            var token = TOKEN.matcher(list.group());
            while (token.find()) found.add(new Located(list.start() + token.start(), number(token.group())));
        }
        var result = found.stream().sorted(Comparator.comparingInt(Located::at)).map(Located::index).distinct().toList();
        if (!result.isEmpty()) return result;
        var count = COUNT.matcher(text);
        if ((comparisonRequested(message) || wholeRoster(message)) && count.find()) {
            int size = number(count.group(1)) + 1;
            if (size >= 2 && size <= 100) return java.util.stream.IntStream.range(0,size).boxed().toList();
        }
        return List.of();
    }

    static <T> List<T> resolve(List<Integer> positions, List<T> roster) {
        List<T> selected = new ArrayList<>();
        for (int position : positions) {
            int index = position == LAST ? roster.size() - 1 : position;
            if (index < 0 || index >= roster.size()) return List.of();
            T value = roster.get(index);
            if (!selected.contains(value)) selected.add(value);
        }
        return List.copyOf(selected);
    }

    private static int number(String value) {
        return switch (value) {
            case "dau tien", "thu nhat", "nhat", "mot" -> 0;
            case "hai" -> 1;
            case "ba" -> 2;
            case "bon", "tu" -> 3;
            case "nam" -> 4;
            case "sau" -> 5;
            case "bay" -> 6;
            case "tam" -> 7;
            case "chin" -> 8;
            case "muoi" -> 9;
            case "cuoi", "cuoi cung" -> LAST;
            default -> Integer.parseInt(value) - 1;
        };
    }
}
