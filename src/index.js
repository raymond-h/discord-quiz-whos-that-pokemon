import assert from 'assert';

import Rx from 'rxjs/Rx';
import Discord from 'discord.js';
import Keyv from 'keyv';
import randomItem from 'random-item';

import { pokemon as pokemonModel } from './pokemon';

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
    const sharedCorrectAnswerObs = correctAnswerObs.share();
    const sharedTimeoutObs = timeoutObs.share();

    const endObs = sharedCorrectAnswerObs.merge(sharedTimeoutObs).delay(10);

    return Rx.Observable.of({ type: 'question', question })
        .concat(Rx.Observable.merge(
            sharedCorrectAnswerObs.map(answer => ({ type: 'correctAnswer', answer })),
            hintsObs.map(hint => ({ type: 'hint', hint })),
            sharedTimeoutObs.map(() => ({ type: 'timeout' }))
        ))
        .takeUntil(endObs);
}

function quizPokemonObservable(cache, guessesObs) {
    return Rx.Observable.defer(() => {
        const randomPokemonObs =
            Rx.Observable.defer(() =>
                pokemonModel.getRandom(cache)
            )
            .share();

        const randomFlavorTextObs =
            randomPokemonObs
            .map(pkmn =>
                randomItem(
                    pkmn.species.flavor_text_entries.filter(isLanguage('en'))
                )
                .flavor_text
            );

        const nameRegexObs =
            randomPokemonObs
            .map(pkmn => pkmn.name)
            .map(fixPokemonName)
            .map(name => new RegExp(name, 'ig'));

        return Rx.Observable.combineLatest(
            randomPokemonObs, randomFlavorTextObs, nameRegexObs
        )
        .mergeMap(([pkmn, flavorText, nameRegex]) =>
            quizObservable(
                // question
                `Who's that Pokémon!? \`\`\`${flavorText.replace(nameRegex, '[REDACTED]')}\`\`\``,

                // observable of right answers
                guessesObs.filter(msg => nameRegex.test(msg.cleanContent)),

                // observable of hints
                Rx.Observable.empty(),

                // timeout observable
                Rx.Observable.timer(15 * 1000)
            )
            .map(ev => {
                ev.pokemon = pkmn;
                return ev;
            })
        )
        .startWith({ type: 'fetchingPokemon' });
    });
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

    const msgObs = Rx.Observable.fromEvent(client, 'message');

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
            await channel.send(`${ev.answer.author} got it right!! It was ${getNameOf(ev.pokemon)}!!`);
        },

        async hint(channel, ev) {
            await channel.send(`Here's a hint: ${ev.hint}`);
        },

        async timeout(channel, ev) {
            await channel.send(`No one answered it right!! It was ${getNameOf(ev.pokemon)}!`);
        },

        async fetchingPokemon(channel) {
            await channel.send(`Getting the next Pokemon...`);
        },

        async end(channel) {
            await channel.send(`That's all, folks!`);
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
.catch(e => console.error(e.stack));
