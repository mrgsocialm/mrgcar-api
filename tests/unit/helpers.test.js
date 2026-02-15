/**
 * Unit tests for utils/helpers.js
 * Data mapping and formatting utilities
 */

const { formatTimeAgo, mapCarRow, mapForumPost, mapNewsRow, mapSliderRow } = require('../../utils/helpers');

// ==================== formatTimeAgo() ====================

describe('formatTimeAgo()', () => {
    test('should return "Az önce" for null/undefined input', () => {
        expect(formatTimeAgo(null)).toBe('Az önce');
        expect(formatTimeAgo(undefined)).toBe('Az önce');
    });

    test('should return "Az önce" for very recent dates (< 1 min)', () => {
        const now = new Date();
        expect(formatTimeAgo(now)).toBe('Az önce');
    });

    test('should return minutes for < 60 min', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const result = formatTimeAgo(fiveMinAgo);
        expect(result).toMatch(/\d+ dk önce/);
    });

    test('should return hours for < 24 hours', () => {
        const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
        const result = formatTimeAgo(threeHoursAgo);
        expect(result).toMatch(/\d+ saat önce/);
    });

    test('should return days for < 7 days', () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000);
        const result = formatTimeAgo(twoDaysAgo);
        expect(result).toMatch(/\d+ gün önce/);
    });

    test('should return formatted date for >= 7 days', () => {
        const twoWeeksAgo = new Date(Date.now() - 14 * 86400 * 1000);
        const result = formatTimeAgo(twoWeeksAgo);
        // Turkish locale date format (e.g., "25.01.2026")
        expect(result).toMatch(/\d+\.\d+\.\d+/);
    });

    test('should handle string dates', () => {
        const now = new Date();
        const result = formatTimeAgo(now.toISOString());
        expect(result).toBe('Az önce');
    });

    test('boundary: exactly 1 minute ago', () => {
        const oneMinAgo = new Date(Date.now() - 60 * 1000);
        const result = formatTimeAgo(oneMinAgo);
        expect(result).toMatch(/1 dk önce/);
    });

    test('boundary: exactly 59 minutes ago', () => {
        const fiftyNineMinAgo = new Date(Date.now() - 59 * 60 * 1000);
        const result = formatTimeAgo(fiftyNineMinAgo);
        expect(result).toMatch(/59 dk önce/);
    });

    test('boundary: exactly 1 hour ago', () => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const result = formatTimeAgo(oneHourAgo);
        expect(result).toMatch(/1 saat önce/);
    });

    test('boundary: exactly 23 hours ago', () => {
        const twentyThreeHoursAgo = new Date(Date.now() - 23 * 3600 * 1000);
        const result = formatTimeAgo(twentyThreeHoursAgo);
        expect(result).toMatch(/23 saat önce/);
    });

    test('boundary: exactly 6 days ago', () => {
        const sixDaysAgo = new Date(Date.now() - 6 * 86400 * 1000);
        const result = formatTimeAgo(sixDaysAgo);
        expect(result).toMatch(/6 gün önce/);
    });
});

// ==================== mapCarRow() ====================

describe('mapCarRow()', () => {
    const fullRow = {
        id: 'abc-123',
        make: 'BMW',
        model: 'M3',
        variant: 'Competition',
        body_type: 'Sedan',
        status: 'published',
        data: { summary: 'Harika bir araba', specifications: {} },
        show_in_slider: true,
        slider_title: 'Yeni BMW M3',
        slider_subtitle: 'Rakipsiz performans',
        slider_order: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
    };

    test('should map all fields from snake_case to camelCase', () => {
        const result = mapCarRow(fullRow);

        expect(result).toEqual({
            id: 'abc-123',
            make: 'BMW',
            model: 'M3',
            variant: 'Competition',
            bodyType: 'Sedan',
            status: 'published',
            data: { summary: 'Harika bir araba', specifications: {} },
            showInSlider: true,
            sliderTitle: 'Yeni BMW M3',
            sliderSubtitle: 'Rakipsiz performans',
            sliderOrder: 1,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-02T00:00:00Z',
        });
    });

    test('should use defaults for missing optional fields', () => {
        const minimalRow = {
            id: 1,
            make: 'Audi',
            model: 'A3',
            status: 'draft',
            created_at: '2026-01-01',
            updated_at: '2026-01-02',
        };

        const result = mapCarRow(minimalRow);

        expect(result.variant).toBe('');
        expect(result.bodyType).toBe('');
        expect(result.data).toEqual({});
        expect(result.showInSlider).toBe(false);
        expect(result.sliderTitle).toBeNull();
        expect(result.sliderSubtitle).toBeNull();
        expect(result.sliderOrder).toBe(0);
    });

    test('should preserve complex data JSONB objects', () => {
        const row = {
            ...fullRow,
            data: {
                specifications: { Motor: '3.0L Twin-Turbo' },
                performanceData: { acceleration: '3.9s' },
                imageUrls: ['http://img.com/1.jpg'],
            },
        };

        const result = mapCarRow(row);
        expect(result.data.specifications.Motor).toBe('3.0L Twin-Turbo');
        expect(result.data.performanceData.acceleration).toBe('3.9s');
        expect(result.data.imageUrls).toHaveLength(1);
    });
});

// ==================== mapForumPost() ====================

describe('mapForumPost()', () => {
    const fullForumRow = {
        id: 'fp-001',
        user_name: 'Ahmet',
        title: 'BMW M3 deneyimim',
        description: 'Kısa açıklama',
        content: 'Detaylı içerik burada...',
        category: 'Deneyim Paylaşımı',
        category_id: 'experience',
        car_brand: 'BMW',
        car_model: 'M3',
        likes: 12,
        replies: 5,
        view_count: 150,
        created_at: new Date().toISOString(),
        is_pinned: false,
    };

    test('should map all fields correctly', () => {
        const result = mapForumPost(fullForumRow);

        expect(result.id).toBe('fp-001');
        expect(result.userName).toBe('Ahmet');
        expect(result.title).toBe('BMW M3 deneyimim');
        expect(result.description).toBe('Kısa açıklama');
        expect(result.content).toBe('Detaylı içerik burada...');
        expect(result.category).toBe('Deneyim Paylaşımı');
        expect(result.categoryId).toBe('experience');
        expect(result.carBrand).toBe('BMW');
        expect(result.carModel).toBe('M3');
        expect(result.likes).toBe(12);
        expect(result.replies).toBe(5);
        expect(result.viewCount).toBe(150);
        expect(result.isPinned).toBe(false);
    });

    test('should compute relative time string', () => {
        const result = mapForumPost(fullForumRow);
        // Should be "Az önce" since created just now
        expect(result.time).toBe('Az önce');
    });

    test('should handle old posts with formatted date', () => {
        const oldRow = {
            ...fullForumRow,
            created_at: new Date('2025-06-15').toISOString(),
        };
        const result = mapForumPost(oldRow);
        expect(result.time).toMatch(/\d+/); // Should have date format
    });

    test('should handle null/undefined created_at', () => {
        const rowWithNoDate = { ...fullForumRow, created_at: null };
        const result = mapForumPost(rowWithNoDate);
        expect(result.time).toBe('Az önce');
    });
});

// ==================== mapNewsRow() ====================

describe('mapNewsRow()', () => {
    const fullNewsRow = {
        id: 'news-001',
        title: '2026 Yeni Model Tanıtımı',
        description: 'Bu yılın en heyecan verici modeli',
        content: 'Uzun haber içeriği burada...',
        category: 'Lansman',
        author: 'MRG Editör',
        image: 'https://img.mrgcar.com/news/model-tanitimi.jpg',
        is_popular: true,
        tags: ['lansman', 'yeni-model'],
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-02T12:00:00Z',
    };

    test('should map all fields correctly', () => {
        const result = mapNewsRow(fullNewsRow);

        expect(result).toEqual({
            id: 'news-001',
            title: '2026 Yeni Model Tanıtımı',
            description: 'Bu yılın en heyecan verici modeli',
            content: 'Uzun haber içeriği burada...',
            category: 'Lansman',
            author: 'MRG Editör',
            image: 'https://img.mrgcar.com/news/model-tanitimi.jpg',
            isPopular: true,
            tags: ['lansman', 'yeni-model'],
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '2026-02-02T12:00:00Z',
        });
    });

    test('should handle null optional fields', () => {
        const minimal = {
            id: 'n2',
            title: 'Min',
            description: null,
            content: 'X',
            category: null,
            author: null,
            image: null,
            is_popular: null,
            tags: null,
            created_at: null,
            updated_at: null,
        };

        const result = mapNewsRow(minimal);
        expect(result.image).toBeNull();
        expect(result.isPopular).toBeNull();
        expect(result.tags).toBeNull();
    });
});

// ==================== mapSliderRow() ====================

describe('mapSliderRow()', () => {
    const fullSliderRow = {
        id: 'slider-001',
        title: 'Yeni BMW M4',
        subtitle: 'Performansın yeni tanımı',
        image_url: 'https://img.mrgcar.com/slider/m4.jpg',
        link_type: 'car',
        link_id: 'car-abc',
        link_url: null,
        order: 0,
        is_active: true,
        created_at: '2026-01-15T08:00:00Z',
    };

    test('should map all fields from snake_case to camelCase', () => {
        const result = mapSliderRow(fullSliderRow);

        expect(result).toEqual({
            id: 'slider-001',
            title: 'Yeni BMW M4',
            subtitle: 'Performansın yeni tanımı',
            imageUrl: 'https://img.mrgcar.com/slider/m4.jpg',
            linkType: 'car',
            linkId: 'car-abc',
            linkUrl: null,
            order: 0,
            isActive: true,
            createdAt: '2026-01-15T08:00:00Z',
        });
    });

    test('should handle external link type', () => {
        const externalRow = {
            ...fullSliderRow,
            link_type: 'external',
            link_id: null,
            link_url: 'https://otomobil.com',
        };

        const result = mapSliderRow(externalRow);
        expect(result.linkType).toBe('external');
        expect(result.linkId).toBeNull();
        expect(result.linkUrl).toBe('https://otomobil.com');
    });

    test('should handle inactive slider', () => {
        const inactiveRow = { ...fullSliderRow, is_active: false, order: 5 };
        const result = mapSliderRow(inactiveRow);
        expect(result.isActive).toBe(false);
        expect(result.order).toBe(5);
    });
});
