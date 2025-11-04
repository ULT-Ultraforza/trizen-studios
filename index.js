const { Client } = require('@elastic/elasticsearch');
const express = require('express');
const app = express();
const client = new Client({ node: 'http://localhost:9200' });

app.use(express.json());
app.use(express.static('.'));

async function init() {
    await client.indices.create({ index: 'trizen' }, { ignore: [400] });
    const content = Array.from(document.querySelectorAll('main p'))
        .map(p => p.textContent).join(' ');
    await client.index({
        index: 'trizen',
        id: 1,
        body: { title: 'Trizen Studios', content }
    });
    console.log('Content indexed!');
}

app.get('/search', async (req, res) => {
    const { q } = req.query;
    const result = await client.search({
        index: 'trizen',
        query: { multi_match: { query: q, fields: ['title', 'content'] } }
    });
    res.json(result.hits.hits.map(h => h._source));
});

app.listen(3000, async () => {
    await init().catch(() => {});
    console.log('Open: http://localhost:3000/trizen-studios.html');
});