import assert from 'assert';

import Rx from 'rxjs/Rx';
import R from 'ramda';
import { takeWhileInclusive } from 'rxjs-extra/operator/takeWhileInclusive';
import Discord from 'discord.js';
import Keyv from 'keyv';
import randomItem from 'random-item';

import { getRandomPokemon, getTypeByName } from './pokemon';
import { minLevenshtein, thisAsParam } from './util';

const client = new Discord.Client();

const isLanguage = langName => entry => entry.language.name === langName;

const getNameOf = pkmn => pkmn.species.names.find(isLanguage('en')).name;

function fixPokemonName(name) {
    if( ['ho-oh', 'mr-mime'].includes(name.toLowerCase()) ) {
        return name;
    }

    return name.replace(/\-.+/g, '');
}

function quizObservable(question, correctAnswerObs, hintsObs, timeoutObs) {

    return Rx.Observable.of({ type: 'question', question })
        .concat(Rx.Observable.merge(
            correctAnswerObs.map(answer => ({ type: 'correctAnswer', answer })),
            hintsObs.map(hint => ({ type: 'hint', hint })),
            timeoutObs.map(() => ({ type: 'timeout' }))
        ))
        .let(thisAsParam(takeWhileInclusive)(
            ev => !['correctAnswer', 'timeout'].includes(ev.type))
        );
}

// possible hint types: 'type', 'stat', 'move', 'genus', 'partialName'
function getHintObservable(cache, pkmn, hintType) {
    switch(hintType) {
        case 'type': {
            return Rx.Observable.from(
                R.sortBy(R.prop('slot'), pkmn.types)
            )
            .mergeMap(type => getTypeByName(cache, type.type.name))
            .map(type => type.names.find(isLanguage('en')).name )
            .toArray()
            .map(types => ({
                hintType, types
            }))
        }

        default: return Rx.Observable.throw(
            new Error(`Unknown hint type '${hintType}'`)
        );
    }
}

function quizPokemonObservable(cache, guessesObs) {
    return Rx.Observable.defer(() => {
        const randomPokemonObs =
            Rx.Observable.defer(() =>
                getRandomPokemon(cache)
            )
            .retry(3)
            .share();

        const randomFlavorTextObs =
            randomPokemonObs
            .map(pkmn =>
                randomItem(
                    pkmn.species.flavor_text_entries.filter(isLanguage('en'))
                )
                .flavor_text
                .replace(/[\f]/g, '\n')
            );

        const nameObs =
            randomPokemonObs
            .map(pkmn => pkmn.name)
            .map(fixPokemonName);

        const hintTypesObs = Rx.Observable.of('type', 'type', 'type');

        const hintsObs =
            randomPokemonObs
            .mergeMap(pkmn =>
                hintTypesObs
                .mergeMap(hintType => getHintObservable(cache, pkmn, hintType))
            )
            .toArray();

        return Rx.Observable.combineLatest(
            randomPokemonObs, randomFlavorTextObs, nameObs, hintsObs
        )
        .mergeMap(([pkmn, flavorText, name, hints]) => {
            const nameRegex = new RegExp(name, 'ig');

            return quizObservable(
                // question
                `**Who's that Pokémon!?** \`\`\`${flavorText.replace(nameRegex, '[REDACTED]')}\`\`\``,

                // observable of right answers
                guessesObs.filter(msg => minLevenshtein(msg.cleanContent, name) <= 2),

                // observable of hints
                Rx.Observable.interval(5 * 1000)
                .take(hints.length)
                .map(i => hints[i]),

                // timeout observable
                Rx.Observable.timer(25 * 1000)
            )
            .map(ev => {
                ev.pokemon = pkmn;
                return ev;
            });
        })
        .startWith({ type: 'fetchingPokemon' });
    });
}

function hintToString(hint) {
    switch(hint.hintType) {
        case 'type': return `Its type is **${hint.types.join('-')}**`;

        default: '???';
    }
}

Promise.resolve()
.then(() => {
    assert.ok(process.env.DISCORD_TOKEN != null, 'DISCORD_TOKEN is not specified, unable to log in.');

    return client.login(process.env.DISCORD_TOKEN);
})
.then(async () => {

    if(process.env.DISCORD_CLIENT_ID != null) {
        const clientId = process.env.DISCORD_CLIENT_ID;
        const inviteUrl = `https://discordapp.com/oauth2/authorize?&client_id=${clientId}&scope=bot&permissions=0`;

        console.log(`Invite URL: ${inviteUrl}`);
    }
    else {
        console.log('*** DISCORD_CLIENT_ID not specified; no invite URL will be generated.');
        console.log('*** The bot will not respond to the `invite` either.');
    }

    const cache = new Keyv({ ttl: 6*60*60*1000 });

    const msgObs = Rx.Observable.fromEvent(client, 'message')
        .filter(msg => msg.author != client.user);

    const msgToMeObs = msgObs.filter(msg => msg.isMentioned(client.user));

    const startGameObs = msgToMeObs
        .filter(msg => /start/.test(msg.cleanContent))
        .map(msg => msg.channel);

    const endGameObs = msgToMeObs
        .filter(msg => /[end|stop]/.test(msg.cleanContent))
        .map(msg => msg.channel);

    const actions = {
        async question(channel, ev) {
            await channel.send(ev.question);
        },

        async correctAnswer(channel, ev) {
            await channel.send(`${ev.answer.author} got it right!! It was **${getNameOf(ev.pokemon)}**!!`);
        },

        async hint(channel, ev) {
            await channel.send(`Here's a hint: ${hintToString(ev.hint)}`);
        },

        async timeout(channel, ev) {
            await channel.send(`No one answered it right!! It was **${getNameOf(ev.pokemon)}**!`);
        },

        async fetchingPokemon(channel) {
            await channel.send(`Getting the next Pokemon...`);
        },

        async end(channel) {
            await channel.send(`That's all, folks!`);
        },

        async error(channel, ev) {
            console.error(ev.error.stack);
            await channel.send(`Oh my, looks like an error occured! \`${ev.error}\``);
        }
    };

    await Promise.all([
        startGameObs
        .mergeMap(channel =>
            quizPokemonObservable(cache, msgObs)
            .repeat(50)
            .takeUntil(
                endGameObs.filter(endChan => channel == endChan)
            )
            .concat(Rx.Observable.of({ type: 'end' }))
            .catch(error => Rx.Observable.of({ type: 'error', error }))
            .mergeMap(ev => actions[ev.type](channel, ev) )
        )
        .toPromise(),

        msgToMeObs
        .filter(() =>
            process.env.DISCORD_CLIENT_ID != null && process.env.DISCORD_OWNER_ID != null
        )
        .filter(msg => msg.author.id == process.env.DISCORD_OWNER_ID)
        .filter(msg => /invite/.test(msg.cleanContent))
        .mergeMap(async msg => {
            const clientId = process.env.DISCORD_CLIENT_ID;
            const inviteUrl = `https://discordapp.com/oauth2/authorize?&client_id=${clientId}&scope=bot&permissions=0`;

            await msg.author.send(`Here's an invite URL: ${inviteUrl}`);
        })
        .toPromise()
    ]);
})
.catch(e => {
    console.error(e.stack);

    setTimeout(() => {
        process.exit(1);
    }, 100);
});
