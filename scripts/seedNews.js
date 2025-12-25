/**
 * Seed script for News data
 * Run after migrations: node scripts/seedNews.js
 */
require('dotenv').config();
const pool = require('../db');

const newsArticles = [
    {
        title: 'Elektrikli Araçların Yükselişi ve Geleceği',
        description: 'Elektrikli araç piyasasındaki en son trendler ve gelecekteki gelişmeler hakkında detaylı bilgi edinin.',
        content: 'Elektrikli araçlar son yıllarda otomotiv endüstrisinde devrim yaratıyor. Tesla\'nın öncülüğünde başlayan bu trend, artık tüm büyük otomotiv üreticilerinin ana odak noktası haline geldi.',
        image: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=500&h=300&fit=crop',
        category: 'Elektrikli Araçlar',
        author: 'Ahmet Yılmaz',
        tags: ['Elektrikli', 'Teknoloji', 'Çevre'],
        is_popular: true
    },
    {
        title: 'Yeni Volkswagen Golf Tanıtıldı',
        description: 'Yeni Volkswagen Golf\'ün özelliklerini, yeniliklerini ve ilk izlenimlerini keşfedin.',
        content: 'Volkswagen\'in efsanevi Golf modelinin yeni nesli tanıtıldı. 8. nesil Golf, teknoloji ve tasarımda önemli yenilikler getiriyor.',
        image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=500&h=300&fit=crop',
        category: 'Yeni Modeller',
        author: 'Mehmet Demir',
        tags: ['Volkswagen', 'Golf', 'Yeni Model'],
        is_popular: true
    },
    {
        title: 'Otonom Sürüş Teknolojisi Gelişmeleri',
        description: 'Son otonom sürüş teknolojileri ve otomotiv endüstrisindeki etkileri hakkında bilgi edinin.',
        content: 'Otonom sürüş teknolojisi, otomotiv endüstrisinin en heyecan verici gelişmelerinden biri. Seviye 5 otonom sürüşe doğru hızla ilerliyoruz.',
        image: 'https://images.unsplash.com/photo-1549924231-f129b911e442?w=500&h=300&fit=crop',
        category: 'Teknoloji',
        author: 'Zeynep Kaya',
        tags: ['Otonom', 'Teknoloji', 'Gelecek'],
        is_popular: false
    },
    {
        title: 'BMW i7: Lüks Elektrikli Sedan',
        description: 'BMW\'nin yeni i7 modeli, lüks ve elektrikli teknolojinin mükemmel birleşimi.',
        content: 'BMW i7, lüks sedan segmentinde elektrikli araçların gücünü gösteriyor. 7 Serisi\'nin elektrikli versiyonu olan i7, teknoloji ve konforu bir araya getiriyor.',
        image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=500&h=300&fit=crop',
        category: 'Lüks Araçlar',
        author: 'Can Özkan',
        tags: ['BMW', 'Elektrikli', 'Lüks'],
        is_popular: false
    }
];

async function seedNews() {
    console.log('🌱 Seeding news data...');

    try {
        for (const article of newsArticles) {
            await pool.query(`
                INSERT INTO news (title, description, content, image, category, author, tags, is_popular)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [article.title, article.description, article.content, article.image, article.category, article.author, article.tags, article.is_popular]);
        }
        console.log(`✅ Seeded ${newsArticles.length} news articles`);

        console.log('✅ News seeding complete!');
    } catch (err) {
        console.error('❌ Error seeding news:', err);
        throw err;
    } finally {
        await pool.end();
    }
}

seedNews();
