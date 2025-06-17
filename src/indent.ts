export const noDetectionLangs = new Set(['plain', 'mediawiki', 'html']);

/**
 * 检测文本的缩进方式
 * @param text 文本内容
 * @param defaultIndent 默认缩进方式
 * @param lang 语言
 */
export const detectIndent = (text: string, defaultIndent: string, lang: string): string => {
	if (noDetectionLangs.has(lang)) {
		return defaultIndent;
	}
	const lineSpaces: number[] = [];
	let tabLines = 0;
	for (const line of text.split('\n')) {
		if (!line.trim()) {
			continue;
		}
		let tabs = 0,
			spaces = 0;
		for (const char of line) {
			if (char === '\t') {
				tabs++;
			} else if (char === ' ') {
				spaces++;
			} else {
				break;
			}
		}
		if (tabs && tabs * 8 >= spaces) {
			tabLines++;
		}
		if (spaces > 1 && spaces >= tabs * 2) {
			lineSpaces.push(spaces);
		}
	}
	const {length} = lineSpaces;
	if (tabLines > length) {
		return '\t';
	} else if (tabLines === length) {
		return defaultIndent;
	}
	for (let i = Math.min(...lineSpaces, 8); i > 2; i--) {
		if (lineSpaces.every(s => s % i === 0)) {
			return ' '.repeat(i);
		}
	}
	return '  ';
};
