import got from 'got';
import randomItem from 'random-item';

const baseUrl = 'http://pokeapi.co/api/v2';

async function get(cache, url) {
    const cachedBody = await cache.get(url);
    if(cachedBody != null) {
        return cachedBody;
    }

    const res = await got.get(url, { json: true });
    cache.set(url, res.body);
    return res.body;
}

export async function getRandomPokemon(cache) {
    const result = await get(cache, `${baseUrl}/pokemon/?limit=10000`);

    const randomResult = randomItem(result.results);

    const data = await get(cache, randomResult.url);
    data.species = await get(cache, data.species.url);

    return data;
}

export async function getTypeByName(cache, name) {
    return await get(cache, `${baseUrl}/type/${name}/`);
}

export async function getStatByName(cache, name) {
    return await get(cache, `${baseUrl}/stat/${name}/`);
}
