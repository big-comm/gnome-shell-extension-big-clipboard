/** Canonical, comma-separated subject labels. Names retain their original case. */
export function subjectNames(value: string): string[] {
	const seen = new Set<string>();
	return value
		.split(',')
		.map((s) => s.normalize('NFC').trim().replace(/\s+/gu, ' '))
		.filter((s) => {
			const key = s.toLocaleLowerCase();
			if (!s || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

export function normalizeSubjects(value: string): string {
	return subjectNames(value).join(', ');
}
