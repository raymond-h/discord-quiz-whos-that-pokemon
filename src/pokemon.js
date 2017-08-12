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

async function getCount(cache) {
    console.log('getCount');
    const data = await get(cache, `${baseUrl}/pokemon/?limit=0`);

    return data.count;
}

async function getById(cache, id) {
    console.log('getById', id);
    const data = await get(cache, `${baseUrl}/pokemon/${id}/`);
    const speciesData = await get(cache, data.species.url);

    data.species = speciesData;

    return data;
}

async function getRandom(cache) {
    console.log('getRandom');
    const result = await get(cache, `${baseUrl}/pokemon/?limit=10000`);

    const randomResult = randomItem(result.results);

    const data = await get(cache, randomResult.url);
    data.species = await get(cache, data.species.url);

    return data;
}

export const pokemon = { getCount, getById, getRandom };
