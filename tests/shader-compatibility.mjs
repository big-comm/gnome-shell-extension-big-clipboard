import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/ui/items/clipboardItem.ts', 'utf8');
const fragment = source.slice(source.indexOf('// GNOME 51 moved'));
const code = ts.transpileModule(fragment, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
}).outputText;
for (const version of [50, 51]) {
	let paints = 0,
		uniforms = {},
		snippet;
	class Effect {
		get_actor() {
			return { get_transformed_size: () => [300, 200] };
		}
		vfunc_paint_target() {
			paints++;
		}
		queue_repaint() {}
	}
	class Legacy extends Effect {
		get_uniform_location(name) {
			return name;
		}
		set_uniform_float(n, _s, v) {
			uniforms[n] = Array.from(v);
		}
		add_glsl_snippet(_h, decl, body) {
			snippet = { decl, body };
		}
	}
	class Native extends Effect {
		set_uniform_float(n, _s, v) {
			uniforms[n] = Array.from(v);
		}
	}
	const C = vm.runInNewContext(code + ';HoleEffect', {
		Shell: version === 50 ? { GLSLEffect: Legacy } : {},
		Clutter: { ShaderEffect: Native },
		Graphene: { Point3D: class {} },
		Cogl: {
			SnippetHook: { FRAGMENT: 0 },
			Snippet: {
				new(_hook, decl) {
					return {
						decl,
						set_replace(body) {
							this.body = body;
						},
					};
				},
			},
		},
		registerClass: () => (C) => C,
	});
	const target = {
		connect() {},
		get_transformed_size: () => [50, 20],
		apply_relative_transform_to_point: () => ({ x: 5, y: 10 }),
	};
	const effect = new C(target);
	if (version === 50) effect.vfunc_build_pipeline();
	else snippet = effect.vfunc_get_static_snippet();
	effect.vfunc_paint_target({}, {});
	assert.equal(paints, 1);
	assert.deepEqual(uniforms.size, [300, 200]);
	assert.deepEqual(uniforms.hole_box, [3.5, 11, 52, 21]);
	assert.ok(snippet.decl.includes('uniform vec4 hole_box'));
	assert.ok(snippet.body.includes('rounded_rect_coverage'));
	assert.equal(effect instanceof (version === 50 ? Legacy : Native), true);
}
console.log('Shader compatibility: GNOME 50 and 51 bases, uniforms and shared source passed');
