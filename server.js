const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const client = new MongoClient('mongodb://localhost:27017');
let db;

app.use(express.static('public'));
app.use(express.json());

// Отримання постів із фільтрацією за пошуком, тегами та пагінацією ($facet)
app.get('/api/posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.limit) || 12;
    const tag = req.query.tag;
    const search = req.query.search;

    const matchStage = { status: 'published' };
    if (tag) matchStage.tags = { $all: tag.split(',') };
    if (search) matchStage.$text = { $search: search };

    const result = await db.collection('posts').aggregate([
      { $match: matchStage },
      { $sort: { published_at: -1, _id: -1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * perPage },
            { $limit: perPage }
          ],
          total: [{ $count: 'count' }]
        }
      }
    ]).toArray();

    res.json({
      posts: result[0].items,
      total: result[0].total[0]?.count || 0,
      page,
      perPage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Не вдалося отримати пости' });
  }
});

// Додавання нового посту через вебформу (Рівень 2)
app.post('/api/posts', async (req, res) => {
  try {
    const { title, excerpt, content, username, category_name, tags } = req.body;
    if (!title || !content || content.length < 100) {
      return res.status(400).json({ error: 'Назва та контент (мінімум 100 символів) є обов\'язковими' });
    }

    const now = new Date();
    const slug = 'post-' + Date.now();
    const newPost = {
      title,
      slug,
      content,
      excerpt: excerpt || content.substring(0, 100) + '...',
      author: {
        user_id: new ObjectId(),
        username: username || 'oleksandr_zrelko',
        avatar_url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=oleksandr'
      },
      category: {
        category_id: new ObjectId(),
        name: category_name || 'Веброзробка'
      },
      tags: Array.isArray(tags) ? tags : ['mongodb', 'nodejs'],
      featured_image: `https://picsum.photos/800/400?random=${Math.floor(Math.random() * 100)}`,
      status: 'published',
      comments: [],
      statistics: { views: 1, likes: 0, dislikes: 0, comments_count: 0 },
      created_at: now,
      updated_at: now,
      published_at: now
    };

    const result = await db.collection('posts').insertOne(newPost);
    res.status(201).json({ _id: result.insertedId, ...newPost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Інкрементація переглядів посту (Рівень 2)
app.post('/api/posts/:id/view', async (req, res) => {
  try {
    await db.collection('posts').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $inc: { 'statistics.views': 1 } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Система рейтингів: лайк / дизлайк (Рівень 2)
app.post('/api/posts/:id/rate', async (req, res) => {
  try {
    const field = req.body.type === 'dislike' ? 'statistics.dislikes' : 'statistics.likes';
    await db.collection('posts').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $inc: { [field]: 1 } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

client.connect().then(() => {
  db = client.db('blog_system');
  app.listen(3000, () => console.log('Сервер працює: http://localhost:3000'));
});