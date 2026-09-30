import type { HLJSApi } from 'highlight.js';

/** Prefer explicit interpreters over statistical detection, including incomplete snippets. */
export function detectCodeLanguage(text: string, hljs?: HLJSApi | null) {
	const sample = text.trim().slice(0, 10000);
	const interpreter = /^#![^\n]*?\b(bash|sh|zsh|ksh|dash|python[\d.]*|node|nodejs|ruby|perl|php)(?=\s|$)/.exec(
		sample,
	)?.[1];
	if (interpreter) {
		const id = /^(bash|sh|zsh|ksh|dash)$/.test(interpreter)
			? 'bash'
			: interpreter.startsWith('python')
				? 'python'
				: interpreter.startsWith('node')
					? 'javascript'
					: interpreter;
		return { id, name: hljs?.getLanguage(id)?.name ?? id };
	}
	// Common short snippets are too small for reliable statistical scores.
	if (/^(?:const|let|var)\s+[$\w]+\s*=/.test(sample) && /(?:console\.(?:log|error|warn)\s*\(|=>)/.test(sample))
		return { id: 'javascript', name: 'JavaScript' };
	if (
		/^(?:sudo\s+)?(?:apt(?:-get)?|dnf|pacman|systemctl)\s+[-\w]/.test(sample) ||
		/^(?:echo|printf)\s+["']/.test(sample)
	)
		return { id: 'bash', name: 'Bash' };
	if (!hljs || !sample) return null;
	// Keywords in ordinary prose (for example "interface" and "package") are not code.
	const hasSyntax =
		/[{};=$]|\b\w+\s*\([^)]*\)|(?:^|\n)\s*(?:def |class |import |from |SELECT |INSERT |UPDATE |DELETE |#include|<\/?[a-zA-Z])/.test(
			sample,
		);
	if (!hasSyntax) return null;
	// Markdown remains a note, not highlighted source code.
	const result = hljs.highlightAuto(sample);
	if (!result.language || ['markdown', 'plaintext', 'asciidoc'].includes(result.language)) return null;
	if (result.relevance / Math.max(1, sample.length / 100) < 3) return null;
	const id = result.language;
	return { id, name: hljs.getLanguage(id)?.name ?? id };
}
