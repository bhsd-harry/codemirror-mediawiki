import {showPanel, EditorView} from '@codemirror/view';
import {nextDiagnostic, setDiagnosticsEffect} from '@codemirror/lint';
import elt from 'crelt';
import {menuRegistry} from './codemirror';
import {panelSelector, diagnosticSelector, menuSelector, messageSelector, actionSelector} from './constants';
import type {Extension, SelectionRange} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {CodeMirror6} from './codemirror';
import type {LintSource, ExtendedAction} from './lintsource';

declare type Severity = 'error' | 'warning';

const statusSelector = '.cm-panel-status',
	workerSelector = '.cm-status-worker',
	errorSelector = '.cm-status-error',
	warningSelector = '.cm-status-warning',
	enabledSelector = '.cm-status-fix-enabled',
	disabledSelector = '.cm-status-fix-disabled',
	workerCls = 'cm-status-worker-enabled',
	lineCls = 'cm-status-line';

function getLintMarker(view: EditorView, severity: Severity): HTMLElement;
function getLintMarker(view: EditorView, severity: 'fix', menu?: HTMLElement): HTMLElement;
function getLintMarker(view: EditorView, severity: Severity | 'fix', menu?: HTMLElement): HTMLElement {
	const marker = elt('div', {class: `cm-status-${severity}`}),
		icon = elt('div');
	if (severity === 'fix') {
		icon.className = disabledSelector.slice(1);
		marker.title = 'Fix all';
		marker.append(icon);
		if (menu) {
			marker.addEventListener('click', ({clientX, clientY}) => {
				if (icon.className === enabledSelector.slice(1)) {
					const {bottom, left} = view.dom.getBoundingClientRect();
					menu.style.bottom = `${bottom - clientY + 5}px`;
					menu.style.left = `${clientX - 20 - left}px`;
					menu.style.display = 'block';
					menu.focus();
				}
			});
		}
	} else {
		icon.className = `cm-lint-marker-${severity}`;
		marker.append(icon, elt('div', '0'));
		marker.addEventListener('click', () => {
			if (marker.parentElement?.classList.contains(workerCls)) {
				nextDiagnostic(view);
				view.focus();
			}
		});
	}
	return marker;
}

const updateDiagnosticsCount = (diagnostics: readonly Diagnostic[], s: Severity, marker: HTMLElement): void => {
	marker.lastChild!.textContent = String(diagnostics.filter(({severity}) => severity === s).length);
};

const toggleClass = (classList: DOMTokenList, enabled: boolean): void => {
	classList.toggle(enabledSelector.slice(1), enabled);
	classList.toggle(disabledSelector.slice(1), !enabled);
};

const getDiagnostics = (all: readonly Diagnostic[], main: SelectionRange): Diagnostic[] =>
	all.filter(({from, to}) => from <= main.to && to >= main.from);

const updateDiagnosticMessage = (
	cm: CodeMirror6,
	allDiagnostics: readonly Diagnostic[],
	main: SelectionRange,
	msg: HTMLElement,
): void => {
	const diagnostics = getDiagnostics(allDiagnostics, main);
	if (diagnostics.length === 0) {
		msg.textContent = '';
	} else {
		const diagnostic = diagnostics.find(({from, to}) => from <= main.head && to >= main.head) ?? diagnostics[0]!,
			view = cm.view!;
		msg.textContent = diagnostic.message;
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

const updateMenu = (
	cm: CodeMirror6,
	allDiagnostics: readonly Diagnostic[],
	main: SelectionRange,
	classList: DOMTokenList,
	optionAll: HTMLElement,
	menu?: HTMLElement,
	fixer?: LintSource['fixer'],
): void => {
	if (menu) {
		const actionable = menuRegistry.filter(({name, isActionable}) => cm.hasPreference(name) && isActionable(cm)),
			fixable = new Set(
				fixer && getDiagnostics(allDiagnostics, main).filter(
					({actions}) => actions?.some(({name}) => name === 'fix'
						|| name !== 'Fix: Stylelint' && name.startsWith('Fix:')),
				).map(({message}) => / \(([^()]+)\)$/u.exec(message)?.[1])
					.filter(message => message !== undefined),
			);
		if (actionable.length === 0 && fixable.size === 0) {
			toggleClass(classList, false);
			return;
		}
		toggleClass(classList, true);
		const actions = actionable.flatMap(({getItems}) => getItems(cm)),
			quickfix = [...fixable].map(rule => {
				const option = elt('div', `Fix all ${rule} problems`);
				option.dataset['rule'] = rule;
				return option;
			});
		if (fixable.size > 0) {
			quickfix.push(optionAll);
		}
		menu.replaceChildren(...actions, ...quickfix);
	}
};

export default (cm: CodeMirror6, fixer: LintSource['fixer']): Extension => [
	showPanel.of(view => {
		let diagnostics: readonly Diagnostic[] = [],
			menu: HTMLElement | undefined;
		if (!view.state.readOnly && (fixer || menuRegistry.length > 0)) {
			menu = elt('div', {class: menuSelector.slice(1), tabIndex: -1});
			if (fixer) {
				menu.addEventListener('click', ({target}) => {
					if (target === menu) {
						return;
					}
					(async () => {
						const {doc} = view.state,
							output = await fixer(doc, (target as HTMLDivElement).dataset['rule']);
						if (output !== doc.toString()) {
							view.dispatch({
								changes: {from: 0, to: doc.length, insert: output},
							});
						}
						view.focus();
					})();
				});
			}
			menu.addEventListener('focusout', () => {
				menu!.style.display = 'none';
			});
			view.dom.append(menu);
		}
		const error = getLintMarker(view, 'error'),
			warning = getLintMarker(view, 'warning'),
			fix = getLintMarker(view, 'fix', menu),
			optionAll = elt('div', 'Fix all auto-fixable problems'),
			worker = elt('div', {class: workerSelector.slice(1)}, error, warning, fix),
			message = elt('div', {class: messageSelector.slice(1)}),
			position = elt('div', {class: lineCls}, '0:0'),
			dom = elt(
				'div',
				{class: `${panelSelector.slice(1)} ${statusSelector.slice(1)}`},
				worker,
				message,
				position,
			),
			{classList} = fix.firstChild as HTMLDivElement;
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
							updateDiagnosticMessage(cm, diagnostics, main, message);
							updateMenu(cm, diagnostics, main, classList, optionAll, menu, fixer);
						}
					}
				}
				if (docChanged || selectionSet) {
					updateDiagnosticMessage(cm, diagnostics, main, message);
					updateMenu(cm, diagnostics, main, classList, optionAll, menu, fixer);
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
			'--fix-icon': "url('data:image/svg+xml,"
				+ '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">'
				// eslint-disable-next-line @stylistic/max-len
				+ '<path d="M8 19a1 1 0 001 1h2a1 1 0 001-1v-1H8zm9-12a7 7 0 10-12 4.9S7 14 7 15v1a1 1 0 001 1h4a1 1 0 001-1v-1c0-1 2-3.1 2-3.1A7 7 0 0017 7"/>'
				+ '</svg>'
				+ "')",
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
		[`${disabledSelector},${enabledSelector}`]: {
			WebkitMaskImage: 'var(--fix-icon)',
			maskImage: 'var(--fix-icon)',
			WebkitMaskSize: '100%',
			maskSize: '100%',
			WebkitMaskRepeat: 'no-repeat',
			maskRepeat: 'no-repeat',
			WebkitMaskPosition: 'center',
			maskPosition: 'center',
		},
		[disabledSelector]: {
			backgroundColor: '#dadde3',
		},
		[enabledSelector]: {
			backgroundColor: '#ffce31',
			cursor: 'pointer',
		},
		[menuSelector]: {
			display: 'none',
			position: 'absolute',
			zIndex: 301,
			border: '1px solid #ddd',
			borderRadius: '2px',
			outline: 'none',
			whiteSpace: 'nowrap',
		},
		[`${menuSelector}>div`]: {
			padding: '1px 5px',
			cursor: 'pointer',
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
			whiteSpace: 'nowrap',
		},
		[diagnosticSelector]: {
			cursor: 'pointer',
		},
	}),
];
