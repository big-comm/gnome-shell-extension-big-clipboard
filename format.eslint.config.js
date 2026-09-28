// SPDX-License-Identifier: CC0-1.0
// SPDX-FileCopyrightText: No rights reserved
import stylistic from '@stylistic/eslint-plugin';

export default [
	{
		plugins: {
			'@stylistic': stylistic,
			'@typescript-eslint': {
				rules: {
					// Mute eslint-disable-next-line comments
					'no-unsafe-assignment': { create: () => ({}) },
					'no-unsafe-call': { create: () => ({}) },
					'no-await-in-loop': { create: () => ({}) },
				},
			},
		},
		rules: {
			'@stylistic/lines-between-class-members': [
				'error',
				{
					enforce: [
						{ blankLine: 'always', prev: '*', next: 'method' },
						{ blankLine: 'always', prev: 'method', next: '*' },
					],
				},
			],
			'@stylistic/padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: '*', next: ['class', 'export', 'function'] },
				{ blankLine: 'always', prev: ['class', 'export', 'function'], next: '*' },
			],
			'@stylistic/lines-around-comment': [
				'error',
				{
					beforeLineComment: true,
					allowBlockStart: true,
				},
			],
		},
	},
];
