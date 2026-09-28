import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';

export const VERSION: number = Number(Config.PACKAGE_VERSION.split('.')[0]);

// Avoid deprecated getters on GNOME 51 while retaining older Shell support.
const masks = St.ButtonMask as typeof St.ButtonMask & { PRIMARY?: number; MIDDLE?: number; SECONDARY?: number };

export const ButtonMask = {
	PRIMARY: masks.PRIMARY ?? St.ButtonMask.ONE,
	MIDDLE: masks.MIDDLE ?? St.ButtonMask.TWO,
	SECONDARY: masks.SECONDARY ?? St.ButtonMask.THREE,
};
