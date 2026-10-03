declare module 'gi://GdkWayland?version=4.0' {
	import Gdk from 'gi://Gdk';
	const GdkWayland: {
		WaylandToplevel: {
			prototype: { set_application_id: (this: Gdk.Surface, id: string) => void };
		};
	};

	export default GdkWayland;
}
