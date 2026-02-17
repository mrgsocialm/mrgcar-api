// Helper: Format timestamp to relative time (e.g., "2 saat önce")
function formatTimeAgo(date) {
    if (!date) return 'Az önce';

    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;

    return past.toLocaleDateString('tr-TR');
}

// Helper: Cars DB row -> response
function mapCarRow(row) {
    // Sanitize data JSON — ensure arrays have no null values
    // (Flutter app crashes on null in performanceData/efficiencyData)
    const data = row.data || {};
    if (Array.isArray(data.performanceData)) {
        data.performanceData = data.performanceData.map(v => v ?? 0);
    }
    if (Array.isArray(data.efficiencyData)) {
        data.efficiencyData = data.efficiencyData.map(v => v ?? 0);
    }

    return {
        id: row.id,
        make: row.make,
        model: row.model,
        variant: row.variant || '',
        bodyType: row.body_type || '',
        status: row.status,
        data: data,
        showInSlider: row.show_in_slider || false,
        sliderTitle: row.slider_title || null,
        sliderSubtitle: row.slider_subtitle || null,
        sliderOrder: row.slider_order || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// Helper: Forum post DB row → response
function mapForumPost(row) {
    return {
        id: row.id,
        userName: row.user_name,
        title: row.title,
        description: row.description,
        content: row.content,
        category: row.category,
        categoryId: row.category_id,
        carBrand: row.car_brand,
        carModel: row.car_model,
        likes: row.likes,
        replies: row.replies,
        viewCount: row.view_count,
        time: formatTimeAgo(row.created_at),
        isPinned: row.is_pinned,
        isLocked: row.is_locked || false,
    };
}

// Helper: News DB row -> response
function mapNewsRow(row) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        content: row.content,
        category: row.category,
        author: row.author,
        image: row.image,
        isPopular: row.is_popular,
        tags: row.tags,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// Helper: Slider DB row -> response
function mapSliderRow(row) {
    return {
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        imageUrl: row.image_url,
        linkType: row.link_type,
        linkId: row.link_id,
        linkUrl: row.link_url,
        order: row.order,
        isActive: row.is_active,
        createdAt: row.created_at,
    };
}

module.exports = {
    formatTimeAgo,
    mapCarRow,
    mapForumPost,
    mapNewsRow,
    mapSliderRow,
};
