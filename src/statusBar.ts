import {showPanel, EditorView} from '@codemirror/view';
import {nextDiagnostic, setDiagnosticsEffect} from '@codemirror/lint';
import {gotoLine} from '@codemirror/search';
import elt from 'crelt';
import {
	panelSelector,
	diagnosticSelector,
	actionSelector,
} from './constants.js';
import type {Extension, SelectionRange} from '@codemirror/state';
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
		const diagnostic = diagnostics.find(({from, to}) => from <= main.head && to >= main.head) ?? diagnostics[0]!;
		if (diagnostic.renderMessage) {
			msg.replaceChildren(diagnostic.renderMessage(view));
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

export default (): Extension => [
	showPanel.of(view => {
		let diagnostics: readonly Diagnostic[] = [];
		const error = getLintMarker(view, 'error'),
			warning = getLintMarker(view, 'warning'),
			worker = elt(
				'div',
				{class: workerSelector.slice(1)},
				error,
				warning,
			),
			message = elt('div', {class: messageSelector.slice(1)}),
			position = elt('div', {class: lineCls}, '0:0'),
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
					const {number, from} = doc.lineAt(main.head);
					position.textContent = `${number}:${main.head - from}`;
					if (!main.empty) {
						position.textContent += ` (${main.to - main.from})`;
					}
				}
			},
		};
	}),
	EditorView.theme({
		[statusSelector]: {
			lineHeight: 1.4,
		},
		[`${statusSelector}>div`]: {
			padding: '0 .3em',
			display: 'table-cell',
		},
		[workerSelector]: {
			WebkitUserSelect: 'none',
			userSelect: 'none',
		},
		[`${workerSelector}>*`]: {
			display: 'table-cell',
			whiteSpace: 'nowrap',
		},
		[`${errorSelector},${warningSelector}`]: {
			paddingRight: '8px',
		},
		[`.${workerCls} ${errorSelector},.${workerCls} ${warningSelector}`]: {
			cursor: 'pointer',
		},
		[`${workerSelector}>*>div`]: {
			display: 'inline-block',
			verticalAlign: 'middle',
		},
		[`${workerSelector}>*>div:first-child`]: {
			marginRight: '4px',
			width: '1em',
			height: '1em',
		},
		[messageSelector]: {
			borderStyle: 'solid',
			borderWidth: '0 1px',
			width: '100%',
		},
		[`${messageSelector} ${actionSelector}`]: {
			paddingTop: 0,
			paddingBottom: 0,
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
		[`&light ${messageSelector}`]: {
			borderColor: '#c8ccd1',
		},
		[`&dark ${messageSelector}`]: {
			borderColor: '#000',
		},
	}),
];
