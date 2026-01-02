import {keymap} from '@codemirror/view';
import {EditorSelection} from '@codemirror/state';
import {keybindings, encapsulateLines} from './keybindings.js';
import type {KeyBinding} from '@codemirror/view';
import type {KeymapConfig} from './keybindings';

/**
 * 生成keymap
 * @param opt 快捷键设置
 * @param opt.key 键名
 * @param opt.pre 前缀
 * @param opt.post 后缀
 * @param opt.splitlines 是否分行
 */
const getKeymap = ({key, pre = '', post = '', splitlines}: KeymapConfig): KeyBinding => ({
	key,
	run(view): true {
		const {state} = view;
		view.dispatch(state.changeByRange(({from, to}) => {
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
				range: from === to
					? EditorSelection.range(from + pre.length, head - post.length)
					: EditorSelection.range(head, head),
				changes: {from, to, insert},
			};
		}));
		return true;
	},
	preventDefault: true,
});

export default keymap.of(keybindings.map(getKeymap));
