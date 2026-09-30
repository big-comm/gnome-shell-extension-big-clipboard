export type MarkdownAction = 'bold' | 'italic' | 'code' | 'bullet' | 'number' | 'quote' | 'link';

export interface TextSelection {
	text: string;
	start: number;
	end: number;
}

/** Clutter offsets count Unicode code points, not UTF-16 code units. */
export function formatMarkdown(text: string, cursor: number, bound: number, action: MarkdownAction): TextSelection {
	const chars = Array.from(text);
	const pos = (n: number) => (n < 0 ? chars.length : Math.min(n, chars.length));
	let start = Math.min(pos(cursor), pos(bound));
	let end = Math.max(pos(cursor), pos(bound));
	const result = (replacement: string, a: number, b: number): TextSelection => ({
		text: chars.slice(0, start).join('') + replacement + chars.slice(end).join(''),
		start: a,
		end: b,
	});
	if (action === 'bullet' || action === 'number' || action === 'quote') {
		while (start > 0 && chars[start - 1] !== '\n') start--;
		// A selection ending at the next line's start does not include that line.
		if (end > start && chars[end - 1] === '\n') end--;
		else while (end < chars.length && chars[end] !== '\n') end++;
		const lines = chars.slice(start, end).join('').split('\n');
		const pattern = action === 'bullet' ? /^(\s*)[-*+] / : action === 'number' ? /^(\s*)\d+\. / : /^(\s*)> /;
		const remove = lines.every((line) => pattern.test(line));
		const value = lines
			.map((line, i) =>
				remove
					? line.replace(pattern, '$1')
					: line.replace(
							/^(\s*)(.*)$/,
							(_m, indent, body) =>
								`${indent}${action === 'bullet' ? '- ' : action === 'quote' ? '> ' : `${i + 1}. `}${body}`,
						),
			)
			.join('\n');
		return result(value, start, start + Array.from(value).length);
	}
	const selected = chars.slice(start, end).join('');
	if (action === 'link') {
		const value = `[${selected}](https://)`;
		const urlStart = start + Array.from(selected).length + 3;
		return result(value, urlStart, urlStart + 8);
	}
	const marker = action === 'bold' ? '**' : action === 'italic' ? '*' : '`';
	const n = marker.length;
	const starRun = (index: number, step: number): number => {
		let count = 0;
		while (chars[index] === '*') {
			count++;
			index += step;
		}
		return count;
	};
	const surroundingItalic = starRun(start - 1, -1) % 2 === 1 && starRun(end, 1) % 2 === 1;
	if (
		start >= n &&
		(marker !== '*' || surroundingItalic) &&
		chars.slice(start - n, start).join('') === marker &&
		chars.slice(end, end + n).join('') === marker
	) {
		start -= n;
		end += n;
		return result(selected, start, start + Array.from(selected).length);
	}
	if (
		selected.length >= 2 * n &&
		selected.startsWith(marker) &&
		selected.endsWith(marker) &&
		(marker !== '*' || (starRun(start, 1) % 2 === 1 && starRun(end - 1, -1) % 2 === 1))
	) {
		const value = selected.slice(n, -n);
		return result(value, start, start + Array.from(value).length);
	}
	return result(marker + selected + marker, start + n, end + n);
}

const escape = (text: string) =>
	text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');

/** Restricted Markdown to escaped Pango markup; no HTML, network or link activation. */
function inline(text: string, depth = 0): string {
	if (depth > 3) return escape(text);
	let out = '';
	for (let i = 0; i < text.length; ) {
		if (text[i] === '\\' && i + 1 < text.length) {
			out += escape(text[i + 1]!);
			i += 2;
			continue;
		}
		const marker = text.startsWith('***', i)
			? '***'
			: text.startsWith('**', i)
				? '**'
				: text[i] === '*'
					? '*'
					: text[i] === '`'
						? '`'
						: null;
		if (marker) {
			let end = text.indexOf(marker, i + marker.length);
			if (end >= 0 && marker === '**') while (text[end + 2] === '*') end++;
			if (end > i + marker.length) {
				const body = text.slice(i + marker.length, end);
				const tag = marker === '**' ? 'b' : marker === '*' ? 'i' : 'tt';
				out +=
					marker === '***'
						? `<b><i>${inline(body, depth + 1)}</i></b>`
						: `<${tag}>${marker === '`' ? escape(body) : inline(body, depth + 1)}</${tag}>`;
				i = end + marker.length;
				continue;
			}
		}
		if (text[i] === '[') {
			const labelEnd = text.indexOf('](', i + 1);
			const urlEnd = labelEnd >= 0 ? text.indexOf(')', labelEnd + 2) : -1;
			if (labelEnd > i && urlEnd >= 0) {
				out += `<u>${escape(text.slice(i + 1, labelEnd))}</u> (${escape(text.slice(labelEnd + 2, urlEnd))})`;
				i = urlEnd + 1;
				continue;
			}
		}
		out += escape(text[i]!);
		i++;
	}
	return out;
}

export const PREVIEW_LIMIT = 20000;

export function markdownPreview(text: string): { markup: string; truncated: boolean } {
	// Bound rendering work; saved and copied content is never truncated.
	const chars: string[] = [];
	for (const char of text) {
		chars.push(char);
		if (chars.length > PREVIEW_LIMIT) break;
	}
	let fenced = false;
	const blocks: string[] = [];
	let paragraph: string[] = [];
	const flush = () => {
		if (paragraph.length) blocks.push(inline(paragraph.join('\n')));
		paragraph = [];
	};
	for (const line of chars.slice(0, PREVIEW_LIMIT).join('').split('\n')) {
		if (/^\s*```/.test(line)) {
			flush();
			fenced = !fenced;
			blocks.push('');
		} else if (fenced) {
			flush();
			blocks.push(`<tt>${escape(line)}</tt>`);
		} else if (/^#{1,6} /.test(line)) {
			flush();
			blocks.push(`<b>${inline(line.replace(/^#{1,6} /, ''))}</b>`);
		} else if (/^\s*[-*+] /.test(line)) {
			flush();
			blocks.push(inline(line.replace(/^(\s*)[-*+] /, '$1• ')));
		} else if (/^\s*> /.test(line)) {
			flush();
			blocks.push(`<i>${inline(line.replace(/^(\s*)> /, '$1│ '))}</i>`);
		} else paragraph.push(line);
	}
	flush();
	return { markup: blocks.join('\n'), truncated: chars.length > PREVIEW_LIMIT };
}
