import {showPanel, EditorView} from '@codemirror/view';
import {
	setDiagnosticsEffect,
	nextDiagnostic,
} from '@codemirror/lint';
import {gotoLine} from '@codemirror/search';
import elt from 'crelt';
import {
	panelSelector,
	diagnosticSelector,
	actionSelector,
} from './constants.js';
import type {Extension, SelectionRange, Text} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {
	ExtendedAction,
} from './lintsource';

declare type Severity = 'error' | 'warning';

const statusSelector = '.cm-panel-status',
	workerSelector = '.cm-status-worker',
	errorSelector = '.cm-status-error',
	warningSelector = '.cm-status-warning',
	messageSelector = '.cm-status-message',
	workerCls = 'cm-status-worker-enabled',
	lineCls = 'cm-status-line';

function getLintMarker(
	view: EditorView,
	severity: Severity,
): HTMLElement {
	const marker = elt('div', {class: `cm-status-${severity}`}),
		icon = elt('div');
	icon.className = `cm-lint-marker-${severity}`;
	marker.append(icon, elt('div', '0'));
	marker.addEventListener('click', () => {
		if (marker.parentElement?.classList.contains(workerCls)) {
			nextDiagnostic(view);
			view.focus();
		}
	});
	return marker;
}

const updateDiagnosticsCount = (diagnostics: readonly Diagnostic[], s: Severity, marker: HTMLElement): void => {
	marker.lastChild!.textContent = String(diagnostics.filter(({severity}) => severity === s).length);
};

const getDiagnostics = (all: readonly Diagnostic[], main: SelectionRange): Diagnostic[] =>
	all.filter(({from, to}) => from <= main.to && to >= main.from);

const updateDiagnosticMessage = (
	view: EditorView,
	allDiagnostics: readonly Diagnostic[],
	main: SelectionRange,
	msg: HTMLElement,
): void => {
	const diagnostics = getDiagnostics(allDiagnostics, main);
	if (diagnostics.length === 0) {
		msg.textContent = '';
	} else {
		const cmp: (a: Diagnostic, b: Diagnostic) => number = main.head === main.from
			? (a, b): number => Math.abs(a.from - main.from) - Math.abs(b.from - main.from)
				|| Math.abs(a.to - main.to) - Math.abs(b.to - main.to)
			: (a, b): number => Math.abs(a.to - main.to) - Math.abs(b.to - main.to)
				|| Math.abs(a.from - main.from) - Math.abs(b.from - main.from);
		diagnostics.sort(cmp);
		const diagnostic = diagnostics.find(({from, to}) => from <= main.head && to >= main.head) ?? diagnostics[0]!;
		if (diagnostic.renderMessage) {
			const rendered = diagnostic.renderMessage(view);
			if (rendered instanceof Element && rendered.classList.contains(diagnosticSelector.slice(1))) {
				msg.replaceChildren(...rendered.childNodes);
			} else {
				msg.replaceChildren(rendered);
			}
		} else {
			msg.textContent = diagnostic.message;
		}
		if (diagnostic.actions) {
			msg.append(...(diagnostic.actions as ExtendedAction[]).map(({name, tooltip, apply}) => {
				const button = elt('button', {type: 'button', class: actionSelector.slice(1)}, name);
				if (tooltip) {
					button.title = tooltip;
				}
				button.addEventListener('click', e => {
					e.preventDefault();
					apply(view, diagnostic.from, diagnostic.to);
				});
				return button;
			}));
		}
	}
};

const updatePosition = (doc: Text, {head, empty, from, to}: SelectionRange, position: HTMLElement): void => {
	const {number, from: f} = doc.lineAt(head);
	position.textContent = `${number}:${head - f}`;
	if (!empty) {
		position.textContent += ` (${to - from})`;
	}
};

export default (
): Extension => [
	showPanel.of(view => {
		let diagnostics: readonly Diagnostic[] = [];
		const error = getLintMarker(
				view,
				'error',
			),
			warning = getLintMarker(
				view,
				'warning',
			),
			worker = elt(
				'div',
				{class: workerSelector.slice(1)},
				error,
				warning,
			),
			message = elt('div', {class: messageSelector.slice(1)}),
			position = elt('div', {class: lineCls}),
			dom = elt(
				'div',
				{class: `${panelSelector.slice(1)} ${statusSelector.slice(1)}`},
				worker,
				message,
				position,
			);
		position.addEventListener('click', () => {
			gotoLine(view);
		});
		updatePosition(view.state.doc, view.state.selection.main, position);
		return {
			dom,
			update({state: {selection: {main}, doc}, transactions, docChanged, selectionSet}): void {
				for (const tr of transactions) {
					for (const effect of tr.effects) {
						if (effect.is(setDiagnosticsEffect)) {
							diagnostics = effect.value;
							worker.classList.toggle(workerCls, diagnostics.length > 0);
							updateDiagnosticsCount(diagnostics, 'error', error);
							updateDiagnosticsCount(diagnostics, 'warning', warning);
							updateDiagnosticMessage(view, diagnostics, main, message);
						}
					}
				}
				if (docChanged || selectionSet) {
					updateDiagnosticMessage(view, diagnostics, main, message);
					updatePosition(doc, main, position);
				}
			},
		};
	}),
	EditorView.theme({
		[statusSelector]: {
			lineHeight: 1.4,
			'&>div': {
				padding: '0 .3em',
				display: 'table-cell',
			},
		},
		[workerSelector]: {
			WebkitUserSelect: 'none',
			userSelect: 'none',
			'&>*': {
				display: 'table-cell',
				whiteSpace: 'nowrap',
				'&>div': {
					display: 'inline-block',
					verticalAlign: 'middle',
					'&:first-child': {
						marginRight: '4px',
						width: '1em',
						height: '1em',
					},
				},
			},
		},
		[`${errorSelector},${warningSelector}`]: {
			paddingRight: '8px',
		},
		[`.${workerCls}`]: {
			[`& ${errorSelector}, & ${warningSelector}`]: {
				cursor: 'pointer',
			},
		},
		[messageSelector]: {
			borderStyle: 'solid',
			borderWidth: '0 1px',
			width: '100%',
			[`& ${actionSelector}`]: {
				paddingTop: 0,
				paddingBottom: 0,
			},
		},
		[`.${lineCls}`]: {
			cursor: 'pointer',
			whiteSpace: 'nowrap',
		},
		[diagnosticSelector]: {
			cursor: 'pointer',
		},
	}),
	EditorView.baseTheme({
		'&light': {
			[`& ${messageSelector}`]: {
				borderColor: '#c8ccd1',
			},
		},
		'&dark': {
			[`& ${messageSelector}`]: {
				borderColor: '#000',
			},
		},
	}),
];
