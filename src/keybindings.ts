export interface KeymapConfig {
	key: string;
	desc: string;
	pre?: string;
	post?: string;
	splitlines?: boolean;
}

export const keybindings = [
	{key: 'Ctrl-8', pre: '<blockquote>', post: '</blockquote>', desc: 'blockquote'},
	{key: 'Mod-.', pre: '<sup>', post: '</sup>', desc: 'sup'},
	{key: 'Mod-,', pre: '<sub>', post: '</sub>', desc: 'sub'},
	{key: 'Ctrl-,', pre: '<sub>', post: '</sub>', desc: 'sub'},
	{key: 'Mod-Shift-6', pre: '<code>', post: '</code>', desc: 'code'},
	{key: 'Ctrl-Shift-5', pre: '<s>', post: '</s>', desc: 's'},
	{key: 'Mod-u', pre: '<u>', post: '</u>', desc: 'u'},
	{key: 'Mod-k', pre: '[[', post: ']]', desc: 'link'},
	{key: 'Mod-i', pre: "''", post: "''", desc: 'italic'},
	{key: 'Mod-b', pre: "'''", post: "'''", desc: 'bold'},
	{key: 'Mod-Shift-k', pre: '<ref>', post: '</ref>', desc: 'ref'},
	{key: 'Mod-/', pre: '<!-- ', post: ' -->', desc: 'comment'},
	{key: 'Ctrl-0', splitlines: true, desc: 'heading 0'},
	...new Array(6).fill(0).map((_, i): KeymapConfig => ({
		key: `Ctrl-${i + 1}`,
		pre: `${'='.repeat(i + 1)} `,
		post: ` ${'='.repeat(i + 1)}`,
		splitlines: true,
		desc: `heading ${i + 1}`,
	})),
	{key: 'Ctrl-7', pre: ' ', splitlines: true, desc: 'pre'},
];

/**
 * 将文本各行包裹在指定的前后缀中
 * @param text 跨行文本
 * @param pre 前缀
 * @param post 后缀
 */
export const encapsulateLines = (text: string, pre: string, post: string): string => {
	const lines = text.split('\n');
	return lines.map(line => {
		const str = (/^(={1,6})(.+)\1\s*$/u.exec(line)?.[2] ?? line).trim();
		return pre === ' ' || lines.length === 1 || line.trim() ? pre + str + post : str;
	}).join('\n');
};
