/**
 * @author Takuya Matsuyama <hi+github@craftz.dog>
 * @see https://github.com/craftzdog/cm6-themes/blob/main/packages/nord/src/index.ts
 */
import {EditorView} from '@codemirror/view';
import {HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {contentSelector, scrollerSelector, panelsSelector, actionSelector, focused, placeholder} from './constants.js';
import type {Extension} from '@codemirror/state';

// Colors from https://www.nordtheme.com/docs/colors-and-palettes
// Polar Night
const base00 = '#2e3440', // black
	base01 = '#3b4252', // dark grey
	base02 = '#434c5e',
	base03 = '#4c566a'; // grey

// Snow Storm
const base04 = '#d8dee9', // grey
	base05 = '#e5e9f0', // off white
	base06 = '#eceff4'; // white

// Frost
const base07 = '#8fbcbb', // moss green
	base08 = '#88c0d0', // ice blue
	base09 = '#81a1c1', // water blue
	base0A = '#5e81ac'; // deep blue

// Aurora
const base0b = '#bf616a', // red
	base0C = '#d08770', // orange
	base0D = '#ebcb8b', // yellow
	base0E = '#a3be8c', // green
	base0F = '#b48ead'; // purple

const invalid = '#d30102',
	darkBorder = '2px solid black',
	outline = `1px solid ${base07}`;

const selectionSelector = '.cm-selectionBackground',
	searchMatch = '.cm-searchMatch',
	searchMatchSelected = `${searchMatch}-selected`;

// Extension to enable the Nord theme (both the editor theme and the highlight style).
export default [
	EditorView.theme(
		{
			'&': {
				color: base04,
				backgroundColor: base00,
			},
			[contentSelector]: {
				caretColor: base04,
			},
			'.cm-cursor,.cm-dropCursor': {
				borderLeftColor: base04,
			},
			[`${selectionSelector},${focused}>${scrollerSelector}>.cm-selectionLayer ${selectionSelector},${
				contentSelector
			} ::selection,${actionSelector},.cm-tooltip-autocomplete>ul>li[aria-selected]`]: {
				backgroundColor: base03,
			},
			[panelsSelector]: {
				backgroundColor: '#252a33',
				color: base04,
				[`&${panelsSelector}-top`]: {
					borderBottom: darkBorder,
				},
				[`&${panelsSelector}-bottom`]: {
					borderTop: darkBorder,
				},
			},
			[searchMatch]: {
				backgroundColor: 'transparent',
				outline,
				[`&${searchMatchSelected}`]: {
					'&,& span': {
						backgroundColor: base04,
						color: base00,
					},
				},
			},
			[focused]: {
				[`& ${searchMatch}${searchMatchSelected}`]: {
					'&,& span': {
						color: base0F,
					},
				},
				'& .cm-nonmatchingBracket': {
					outline,
				},
				'& .cm-matchingBracket': {
					outline,
					backgroundColor: base06,
					color: base02,
				},
			},
			'.cm-activeLine': {
				backgroundColor: 'rgb(76,86,106,.27)',
			},
			'.cm-selectionMatch': {
				backgroundColor: base05,
				color: base01,
			},
			'div.cm-gutters': {
				backgroundColor: base00,
				color: base0A,
				border: 'none',
			},
			'.cm-activeLineGutter': {
				backgroundColor: base03,
				color: base04,
			},
			[`.${placeholder}`]: {
				backgroundColor: base03,
				border: 'none',
				color: '#ddd',
			},
			'.cm-tooltip': {
				border: 'none',
				backgroundColor: base01,
				'& .cm-tooltip-arrow': {
					'&:before': {
						borderTopColor: 'transparent',
						borderBottomColor: 'transparent',
					},
					'&:after': {
						borderTopColor: base01,
						borderBottomColor: base01,
					},
				},
			},
		},
		{dark: true},
	),
	syntaxHighlighting(HighlightStyle.define([
		{
			tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName, tags.meta],
			color: base08,
		},
		{
			tag: [
				tags.variableName,
				tags.function(tags.variableName),
				tags.brace,
				tags.url,
				tags.escape,
				tags.special(tags.string),
				tags.processingInstruction,
				tags.inserted,
			],
			color: base07,
		},
		{
			tag: tags.labelName,
			color: base09,
		},
		{
			tag: [
				tags.keyword,
				tags.color,
				tags.constant(tags.name),
				tags.standard(tags.name),
				tags.regexp,
				tags.heading5,
				tags.heading6,
			],
			color: base0A,
		},
		{
			tag: [tags.definition(tags.name), tags.separator, tags.operator, tags.operatorKeyword, tags.string],
			color: base0E,
		},
		{
			tag: tags.annotation,
			color: invalid,
		},
		{
			tag: [
				tags.number,
				tags.changed,
				tags.annotation,
				tags.modifier,
				tags.self,
				tags.namespace,
				tags.tagName,
				tags.quote,
			],
			color: base0F,
		},
		{
			tag: [tags.typeName, tags.className, tags.attributeName, tags.contentSeparator],
			color: base0D,
		},
		{
			tag: tags.squareBracket,
			color: base0b,
		},
		{
			tag: tags.link,
			color: base0E,
			textDecoration: 'underline',
			textUnderlinePosition: 'under',
		},
		{
			tag: tags.monospace,
			color: base04,
			fontStyle: 'italic',
		},
		{
			tag: tags.comment,
			color: base03,
			fontStyle: 'italic',
		},
		{
			tag: [
				tags.strong,
				tags.heading,
				tags.special(tags.heading1),
				tags.heading1,
				tags.heading2,
				tags.heading3,
				tags.heading4,
			],
			fontWeight: 'bold',
			color: base0A,
		},
		{
			tag: tags.emphasis,
			fontStyle: 'italic',
			color: base0A,
		},
		{
			tag: tags.strikethrough,
			textDecoration: 'line-through',
		},
		{
			tag: [tags.angleBracket, tags.atom, tags.bool, tags.special(tags.variableName)],
			color: base0C,
		},
		{
			tag: tags.invalid,
			color: base02,
			borderBottom: `1px dotted ${invalid}`,
		},
	])),
] satisfies Extension;
