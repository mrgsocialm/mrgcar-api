/**
 * Forum kategori sayaçlarını gerçek post sayılarına göre günceller
 * 
 * Kullanım: node scripts/recalculateForumCounts.js
 */
require('dotenv').config();
const pool = require('../db');

async function recalculateCounts() {
  console.log('🔄 Forum kategori sayaçları yeniden hesaplanıyor...\n');

  try {
    // Her kategori için gerçek post sayısı ve benzersiz üye sayısını hesapla
    await pool.query(`
      UPDATE forum_categories fc
      SET post_count = (
        SELECT COUNT(*)
        FROM forum_posts fp
        WHERE fp.category_id = fc.id
      ),
      member_count = (
        SELECT COUNT(DISTINCT user_name)
        FROM forum_posts fp
        WHERE fp.category_id = fc.id
      ),
      updated_at = CURRENT_TIMESTAMP
    `);

    console.log('✅ Kategori sayaçları güncellendi!\n');

    // Güncel durumu göster
    const { rows } = await pool.query(`
      SELECT fc.id, fc.name, fc.post_count, fc.member_count
      FROM forum_categories fc
      ORDER BY fc.post_count DESC
    `);

    console.log('📊 Güncel Kategori Durumu:');
    console.log('─'.repeat(60));
    rows.forEach(row => {
      console.log(`  ${row.name}: ${row.post_count} konu, ${row.member_count} üye`);
    });
    console.log('─'.repeat(60));

    await pool.end();
    console.log('\n✅ İşlem tamamlandı!');
  } catch (err) {
    console.error('❌ Hata:', err.message);
    process.exit(1);
  }
}

recalculateCounts();
