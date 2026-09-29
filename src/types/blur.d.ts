declare module 'gi://GIRepository' {
	const GIRepository: {
		Repository: {
			dup_default(): {
				get_search_path(): string[];
				get_library_path(): string[];
				get_version(namespace: string): string;
			};
		};
	};
	export default GIRepository;
}

declare module 'resource:///org/gnome/Shell/Extensions/js/misc/config.js' {
	export const PACKAGE_VERSION: string;
}
