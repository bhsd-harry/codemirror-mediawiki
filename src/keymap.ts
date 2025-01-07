import {keymap} from '@codemirror/view';
import {EditorSelection} from '@codemirror/state';
import type {KeyBinding} from '@codemirror/view';

declare interface KeymapConfig {
	key: string;
	pre?: string;
	post?: string;
	splitlines?: boolean;
}

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
					insert = state.sliceDoc(start, end).split('\n')
						.map(line => {
							const str = (/^(={1,6})(.+)\1$/u.exec(line)?.[2] ?? line).trim();
							return pre === ' ' || line.trim() ? pre + str + post : str;
						})
						.join('\n');
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

export default keymap.of(([
	{key: 'Ctrl-8', pre: '<blockquote>', post: '</blockquote>'},
	{key: 'Mod-.', pre: '<sup>', post: '</sup>'},
	{key: 'Mod-,', pre: '<sub>', post: '</sub>'},
	{key: 'Mod-Shift-6', pre: '<code>', post: '</code>'},
	{key: 'Ctrl-Shift-5', pre: '<s>', post: '</s>'},
	{key: 'Mod-u', pre: '<u>', post: '</u>'},
	{key: 'Mod-k', pre: '[[', post: ']]'},
	{key: 'Mod-i', pre: "''", post: "''"},
	{key: 'Mod-b', pre: "'''", post: "'''"},
	{key: 'Mod-Shift-k', pre: '<ref>', post: '</ref>'},
	{key: 'Mod-/', pre: '<!-- ', post: ' -->'},
	{key: 'Ctrl-0', splitlines: true},
	...new Array(6).fill(0).map((_, i) => ({
		key: `Ctrl-${i + 1}`,
		pre: `${'='.repeat(i + 1)} `,
		post: ` ${'='.repeat(i + 1)}`,
		splitlines: true,
	})),
	{key: 'Ctrl-7', pre: ' ', splitlines: true},
] satisfies KeymapConfig[]).map(getKeymap));
