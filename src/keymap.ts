import {EditorSelection} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {keybindings, encapsulateLines} from './keybindings.js';
import type {KeyBinding} from '@codemirror/view';
import type {KeymapConfig} from './keybindings';

const reKartographer = /(?:^|_)mw-tag-map(?:link|frame)(?:$|_)/u;

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
		view.dispatch(state.changeByRange(({from, to}) => {
			if (
				key === 'Mod-/'
				&& reKartographer.test(tree.resolveInner(from, 1).name)
				&& reKartographer.test(tree.resolveInner(to, -1).name)
			) {
				// JSONC comment
				if (from === to) {
					pre = '//';
					post = '';
				} else {
					pre = '/*';
					post = '*/';
				}
			}
			if (splitlines) {
				const start = state.doc.lineAt(from).from,
					end = state.doc.lineAt(to).to,
					insert = encapsulateLines(state.sliceDoc(start, end), pre, post);
				return {
					range: EditorSelection.range(start, start + insert.length),
					changes: {from: start, to: end, insert},
				};
			}
			const insert = pre + state.sliceDoc(from, to) + post,
				head = from + insert.length;
			return {
				range: EditorSelection.cursor(from === to ? from + pre.length : head),
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
