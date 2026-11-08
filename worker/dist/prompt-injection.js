"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeResumeForLlm = sanitizeResumeForLlm;
const node_crypto_1 = require("node:crypto");
const REDACTED_LINE = "[REDACTED_POSSIBLE_PROMPT_INJECTION]";
const RULES = [
    {
        id: "en_ignore_previous_instructions",
        re: /\b(ignore|disregard|forget)\b.{0,60}\b(previous|prior|above)\b.{0,30}\b(instruction|instructions|message|messages|system|developer)\b/i,
    },
    {
        id: "en_reveal_system_prompt",
        re: /\b(reveal|show|print|leak|display)\b.{0,80}\b(system prompt|developer message|hidden instructions|policy)\b/i,
    },
    {
        id: "en_role_system_developer",
        re: /\b(role)\s*[:=]\s*(system|developer)\b/i,
    },
    {
        id: "en_begin_prompt_marker",
        re: /\b(begin)\b.{0,20}\b(system prompt|developer message|prompt)\b/i,
    },
    {
        id: "en_jailbreak_terms",
        re: /\b(jailbreak|do anything now|\bdan\b)\b/i,
    },
    {
        id: "ru_ignore_instructions",
        re: /(^|[^\p{L}\p{N}])(игнорир(?:уй|уйте)|не\s+следуй(?:те)?).{0,80}(инструкц|указан|правил)/iu,
    },
    {
        id: "ru_reveal_system_prompt",
        re: /(^|[^\p{L}\p{N}])(раскрой|покажи|выведи|сообщи|продемонстрируй).{0,100}(системн(?:ый|ые)\s+промпт|скрыт(?:ые|ый)\s+инструкц|политик)/iu,
    },
    {
        id: "ru_role_system_developer",
        re: /(^|[^\p{L}\p{N}])(роль|role)\s*[:=]\s*(system|developer)/iu,
    },
    {
        id: "ru_you_are_now",
        re: /(^|[^\p{L}\p{N}])(ты\s+(?:теперь|сейчас)).{0,30}(система|админ|developer)/iu,
    },
];
function sanitizeResumeForLlm(resumeText) {
    const raw = String(resumeText ?? "");
    const normalizedForHash = normalizeForScan(raw, { lowerCase: true });
    const normalizedSha256 = sha256Hex(normalizedForHash);
    const rawLines = raw.split(/\r?\n/);
    const outLines = [];
    const matchedRuleIds = new Set();
    let redactedLineCount = 0;
    for (const line of rawLines) {
        const scanLine = normalizeForScan(line, { lowerCase: true });
        const matched = matchRules(scanLine);
        if (matched.length === 0) {
            outLines.push(line);
            continue;
        }
        redactedLineCount += 1;
        for (const id of matched)
            matchedRuleIds.add(id);
        const previous = outLines[outLines.length - 1];
        if (previous !== REDACTED_LINE)
            outLines.push(REDACTED_LINE);
    }
    return {
        sanitizedText: outLines.join("\n"),
        safety: {
            injectionDetected: redactedLineCount > 0,
            redactedLineCount,
            matchedRuleIds: Array.from(matchedRuleIds).sort(),
        },
        normalizedSha256,
    };
}
function matchRules(scanLine) {
    if (!scanLine)
        return [];
    const matched = [];
    for (const rule of RULES) {
        try {
            if (rule.re.test(scanLine))
                matched.push(rule.id);
        }
        catch {
            // Sanitization should never fail because of a bad rule.
        }
    }
    return matched;
}
function normalizeForScan(input, opts) {
    let value = String(input ?? "");
    try {
        value = value.normalize("NFKC");
    }
    catch {
        // Some runtimes may not support normalize; keep scanning best-effort.
    }
    value = value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
    value = value.replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
    value = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    value = value.replace(/\s+/g, " ").trim();
    return opts.lowerCase ? value.toLowerCase() : value;
}
function sha256Hex(text) {
    try {
        return (0, node_crypto_1.createHash)("sha256").update(text, "utf8").digest("hex");
    }
    catch {
        return `sha256_unavailable_${String(text.length)}`;
    }
}
