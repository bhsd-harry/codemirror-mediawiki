import * as assert from 'assert';
import {detectIndent, getLines} from '../src/indent';
import {createState} from './util';

const mockTest = (text: string, result: string): void => {
	assert.strictEqual(detectIndent(text, '', 'css'), result);
};

const linesTest = (text: string, long = false): void => {
	const state = createState(text);
	assert.strictEqual(Boolean(state.doc.children), long);
	assert.deepStrictEqual(getLines(state.doc), text.split('\n'));
};

describe('content per line', () => {
	it('short text', () => {
		linesTest(
			`{{Short description|Domesticated species of canid}}
{{Redirect2|Doggy|Pooch|other uses|Dog (disambiguation)|and|Doggy (disambiguation)|and|Pooch (disambiguation)}}
{{good article}}
{{pp-move}}
{{protection padlock|small=yes}}
{{cs1 config|name-list-style=vanc|mode=cs1|display-authors=6}}
{{Use dmy dates|date=October 2024}}`,
		);
	});
	it('long text', () => {
		linesTest(
			`{{Short description|Domesticated species of canid}}
{{Redirect2|Doggy|Pooch|other uses|Dog (disambiguation)|and|Doggy (disambiguation)|and|Pooch (disambiguation)}}
{{good article}}
{{pp-move}}
{{protection padlock|small=yes}}
{{cs1 config|name-list-style=vanc|mode=cs1|display-authors=6}}
{{Use dmy dates|date=October 2024}}
{{Speciesbox
| name = Dog
| fossil_range = {{fossil range|0.0142|0}} [[Late Pleistocene]] (14,200 years ago) to present<ref name=Thalmann2018 />
| image = <!-- Please do not change the lead images without discussion -->
 {{multiple image
 | perrow = 3/3/2
 | total_width = 275
 | border = infobox
 | image1 = Blue merle koolie short coat heading sheep (cropped).jpg
 | image2 = Dog - നായ-6.JPG
 | image3 = Chin posing.jpg
 | image4 = Retriever in water.jpg
 | image5 = Black Labrador Retriever - Male IMG 3323 (cropped).jpg
 | image7 = Brooks Chase Ranger of Jolly Dogs Jack Russell.jpg
 | image8 = Huskiesatrest.jpg
 | image9 = Wilde huendin am stillen.jpg
 }}
| status = DOM
| genus = Canis
| species = familiaris
| authority = [[Carl Linnaeus|Linnaeus]], 1758<ref name=linnaeus1758 />
| synonyms_ref = <ref name=wozencraft2005 />
| synonyms = {{collapsible list|bullets=true|
|''C. aegyptius'' {{small|Linnaeus, 1758}}
}}
}}`,
			true,
		);
	});
});

describe('smart indentation', () => {
	it('detect indentation', () => {
		mockTest(' a\n  ', '');
		mockTest('a\n   b\n      c', '   ');
		mockTest('a\n\tb\n\t\tc', '\t');
	});
});
