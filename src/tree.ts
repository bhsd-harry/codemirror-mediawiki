import type * as Monaco from 'monaco-editor';
import type {editor, Range as R, Position} from 'monaco-editor';
import type {EditorView} from '@codemirror/view';
import type {AST} from 'wikiparser-node';

declare type Tree = Promise<AST> & {docChanged?: boolean};

export const trees = new WeakMap<editor.ITextModel | EditorView, Tree>();

/**
 * 获取语法树
 * @param model 键
 * @param stage 解析阶段，现仅用于CodeMirror
 */
export const getTree = (model: editor.ITextModel | EditorView, stage = 8): Tree => {
	let tree = trees.get(model);
	if (!tree || tree.docChanged) {
		tree = wikiparse.json('state' in model ? String(model.state.doc) : model.getValue(), true, -5, stage);
		trees.set(model, tree);
	}
	return tree;
};

export const fromPositions = (monaco: typeof Monaco, model: editor.ITextModel, ref: [number, number]): R =>
	monaco.Range.fromPositions(...ref.map(i => model.getPositionAt(i)) as [Position, Position]);
