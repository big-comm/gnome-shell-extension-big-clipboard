import * as Config from 'resource:///org/gnome/shell/misc/config.js';

export const VERSION: number = Number(Config.PACKAGE_VERSION.split('.')[0]);
