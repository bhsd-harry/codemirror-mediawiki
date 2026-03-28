import {EditorSelection} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {keybindings, encapsulateLines} from './keybindings.js';
import {getTag} from './matchTag.js';
import {sliceDoc, getExtTags} from './util.js';
import type {KeyBinding} from '@codemirror/view';
import type {EditorState} from '@codemirror/state';
import type {Tree} from '@lezer/common';
import type {KeymapConfig} from './keybindings';

/**
 * @ignore
 */
export const getExtNames = (state: EditorState, tree: Tree, pos: number, side: 1 | -1): string[] => {
	const node = tree.resolveInner(pos, side),
		{name} = node;
	if (name === 'Document') {
		const {doc} = state,
			end = side === 1 ? 'to' : 'from';
		let line = doc.lineAt(pos);
		if (line[end] === pos) {
			const {lines} = doc;
			for (let {number} = line; number > 0 && number <= lines; number -= side) {
				line = doc.line(number);
				if (line.length > 0) {
					return getExtNames(state, tree, line[end], -side as 1 | -1);
				}
			}
		}
		return [];
	}
	const ext = name.includes('mw-tag-') ? getExtTags(name.split('_')) : [];
	if (name.includes('mw-exttag-bracket')) {
		const bracket = sliceDoc(state, node),
			{from} = node;
		// `<score>`、`<maplink>`和`<mapfram>`内部均不可包含其他扩展标签，所以可以省略一些情形
		if (side === 1 ? bracket === '</' && from === pos : bracket === '>') {
			// 在扩展标签旁，如 `・</score>` 或 `<maplink>・`
			const sibling = node[side === 1 ? 'nextSibling' : 'prevSibling'],
				tag = sibling && getTag(state, sibling);
			if (tag && (side === 1 || !tag.closing)) {
				ext.push(tag.name);
			}
		} else if (bracket === '></' && from + 1 === pos) {
			// 扩展标签内尚无内容，如 `<score>・</score>`
			const {prevSibling} = node,
				tag = prevSibling && getTag(state, prevSibling);
			if (tag) {
				ext.push(tag.name);
			}
		}
	}
	return ext;
};

const isExtRange = (from: string[], to: string[], empty: boolean, names: string[]): boolean =>
	names.some(name => empty ? from.includes(name) || to.includes(name) : from.includes(name) && to.includes(name));

/**
 * 生成keymap
 * @param opt 快捷键设置
 * @param opt.key 键名
 * @param opt.pre 前缀
 * @param opt.post 后缀
 * @param opt.splitlines 是否分行
 */
export const getWikiKeymap = ({key, pre = '', post = '', splitlines}: KeymapConfig): KeyBinding => ({
	key,
	run(view): true {
		const {state} = view,
			tree = syntaxTree(state);
		view.dispatch(state.changeByRange(({from, to, empty}) => {
			let before = pre,
				after = post;
			if (key === 'Mod-/') {
				const fromExt = getExtNames(state, tree, from, 1),
					toExt = getExtNames(state, tree, to, -1);
				if (isExtRange(fromExt, toExt, empty, ['maplink', 'mapframe'])) {
					// JSONC comment
					if (empty) {
						before = '//';
						after = '';
					} else {
						before = '/* ';
						after = ' */';
					}
				} else if (isExtRange(fromExt, toExt, empty, ['score'])) {
					// LilyPond comment
					if (empty) {
						before = '%';
						after = '';
					} else {
						before = '%{ ';
						after = ' %}';
					}
				}
			}
			if (splitlines) {
				const start = state.doc.lineAt(from).from,
					end = state.doc.lineAt(to).to,
					insert = encapsulateLines(state.sliceDoc(start, end), before, after);
				return {
					range: EditorSelection.range(start, start + insert.length),
					changes: {from: start, to: end, insert},
				};
			}
			const insert = before + state.sliceDoc(from, to) + after,
				head = from + insert.length;
			return {
				range: EditorSelection.cursor(empty ? from + before.length : head),
				changes: {from, to, insert},
			};
		}));
		return true;
	},
	preventDefault: true,
});

/**
 * The [formatting](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#formatkeymap)
 * key bindings for Wikitext.
 */
export default keybindings.map(getWikiKeymap);
