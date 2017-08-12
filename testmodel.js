const Keyv = require('keyv');
const randomItem = require('random-item');
const { pokemon } = require('./lib/pokemon');

const cache = new Keyv();

const isLanguage = langName => entry => entry.language.name === langName;

pokemon.getRandom(cache)
// .then(pkmn => {
// 	console.log(
// 		JSON.stringify(
// 			pkmn.species.flavor_text_entries
// 			.filter(isLanguage('en'))
// 		)
// 	);
// 	return pkmn;
// })
.then(pkmn =>
	randomItem(
		pkmn.species.flavor_text_entries
		.filter(isLanguage('en'))
		.map(fte => fte.flavor_text.replace(/\s*\n\s*/g, ' '))
	)
)
.then(console.log)
.catch(e => console.error(e.stack));
