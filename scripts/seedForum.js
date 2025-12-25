/**
 * Seed script for Forum data
 * Run after migrations: node scripts/seedForum.js
 */
require('dotenv').config();
const pool = require('../db');

const forumCategories = [
    {
        id: 'technical',
        name: 'Teknik Sorular',
        description: 'Motor, şanzıman, elektrik ve diğer teknik konular',
        icon: 'build',
        color: '#4CAF50',
        type: 'general',
        post_count: 156,
        member_count: 1240
    },
    {
        id: 'maintenance',
        name: 'Bakım & Onarım',
        description: 'Periyodik bakım, arıza teşhis ve onarım tavsiyeleri',
        icon: 'handyman',
        color: '#9C27B0',
        type: 'general',
        post_count: 234,
        member_count: 2100
    },
    {
        id: 'accessories',
        name: 'Lastik & Aksesuarlar',
        description: 'Lastik önerileri, jant seçimi ve aksesuar tavsiyeleri',
        icon: 'tire_repair',
        color: '#795548',
        type: 'general',
        post_count: 89,
        member_count: 650
    },
    {
        id: 'fuel_performance',
        name: 'Yakıt & Performans',
        description: 'Yakıt tüketimi, performans artırma ve ECU yazılımları',
        icon: 'local_gas_station',
        color: '#FF9800',
        type: 'general',
        post_count: 178,
        member_count: 890
    },
    {
        id: 'buying',
        name: 'Satın Alma',
        description: 'Araç alım tavsiyeleri, ekspertiz ve fiyat danışmanlığı',
        icon: 'shopping_cart',
        color: '#F44336',
        type: 'general',
        post_count: 312,
        member_count: 3200
    },
    {
        id: 'general',
        name: 'Genel Sohbet',
        description: 'Otomobil dünyasından haberler ve genel sohbetler',
        icon: 'chat',
        color: '#2196F3',
        type: 'general',
        post_count: 567,
        member_count: 4500
    }
];

const forumPosts = [
    {
        user_name: 'mrgcar_owner',
        title: 'Golf 7 1.2 TSI uzun yol tüketimi',
        description: 'Uzun yolda tüketim değerleri nasıl, gerçek kullanıcı yorumları?',
        content: 'Arkadaşlar merhaba, Golf 7 1.2 TSI ile uzun yola çıkan var mı? Ortalama tüketim değerleriniz nasıl, özellikle 120-130 bandında?',
        category: 'Yakıt & Performans',
        category_id: 'fuel_performance',
        car_brand: 'Volkswagen',
        car_model: 'Golf 7',
        likes: 23,
        replies: 12,
        view_count: 156,
        is_pinned: false
    },
    {
        user_name: 'bmw_fan',
        title: 'E46 mı E92 mi? Hangisi alınır?',
        description: 'Bütçe kısıtlı, hangisine yönelmek mantıklı?',
        content: 'E46 nostalji, E92 teknoloji… Kafam çok karışık. Günlük kullanım + ara sıra track day düşünüyorum.',
        category: 'Genel Sohbet',
        category_id: 'general',
        car_brand: 'BMW',
        car_model: 'E46 / E92',
        likes: 40,
        replies: 19,
        view_count: 289,
        is_pinned: true
    },
    {
        user_name: 'teknik_uzman',
        title: 'DSG şanzıman bakımı ne sıklıkla yapılmalı?',
        description: 'VAG grubu araçlarda DSG bakım aralıkları ve maliyetler',
        content: 'DSG şanzımanların bakımı çok önemli. Resmi servisler 60.000 km diyor ama bazı ustalar 40.000 km öneriyor. Siz ne düşünüyorsunuz?',
        category: 'Bakım & Onarım',
        category_id: 'maintenance',
        car_brand: null,
        car_model: null,
        likes: 67,
        replies: 34,
        view_count: 512,
        is_pinned: true
    },
    {
        user_name: 'elektrikli_fan',
        title: 'Tesla Model 3 kış performansı nasıl?',
        description: 'Soğuk havalarda menzil kaybı ve şarj süreleri hakkında',
        content: 'Kışın -10 derecede menzil ne kadar düşüyor? Supercharger\'da şarj süresi artıyor mu?',
        category: 'Teknik Sorular',
        category_id: 'technical',
        car_brand: 'Tesla',
        car_model: 'Model 3',
        likes: 35,
        replies: 21,
        view_count: 234,
        is_pinned: false
    },
    {
        user_name: 'klasik_araba',
        title: 'Lastik seçiminde dikkat edilmesi gerekenler',
        description: 'Yaz/kış lastik önerileri ve marka karşılaştırmaları',
        content: 'Michelin mi Bridgestone mu? Yoksa Continental mı tercih edilmeli? Fiyat/performans oranı en iyi olan hangisi?',
        category: 'Lastik & Aksesuarlar',
        category_id: 'accessories',
        car_brand: null,
        car_model: null,
        likes: 28,
        replies: 15,
        view_count: 178,
        is_pinned: false
    }
];

async function seedForum() {
    console.log('🌱 Seeding forum data...');

    try {
        // Seed categories
        for (const cat of forumCategories) {
            await pool.query(`
                INSERT INTO forum_categories (id, name, description, icon, color, type, post_count, member_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    icon = EXCLUDED.icon,
                    color = EXCLUDED.color,
                    type = EXCLUDED.type,
                    post_count = EXCLUDED.post_count,
                    member_count = EXCLUDED.member_count,
                    updated_at = CURRENT_TIMESTAMP
            `, [cat.id, cat.name, cat.description, cat.icon, cat.color, cat.type, cat.post_count, cat.member_count]);
        }
        console.log(`✅ Seeded ${forumCategories.length} forum categories`);

        // Seed posts
        for (const post of forumPosts) {
            await pool.query(`
                INSERT INTO forum_posts (user_name, title, description, content, category, category_id, car_brand, car_model, likes, replies, view_count, is_pinned)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [post.user_name, post.title, post.description, post.content, post.category, post.category_id, post.car_brand, post.car_model, post.likes, post.replies, post.view_count, post.is_pinned]);
        }
        console.log(`✅ Seeded ${forumPosts.length} forum posts`);

        console.log('✅ Forum seeding complete!');
    } catch (err) {
        console.error('❌ Error seeding forum:', err);
        throw err;
    } finally {
        await pool.end();
    }
}

seedForum();
