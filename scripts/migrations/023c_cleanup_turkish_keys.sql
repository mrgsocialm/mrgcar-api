-- Cleanup: remove all old Turkish keys from specifications
-- English keys already exist, just purge the duplicates

UPDATE cars SET data = (
  data::jsonb || jsonb_build_object('specifications',
    (data::jsonb->'specifications')
    - 'Motor Kodu'
    - 'Motor Tipi'
    - 'Motor Hacmi'
    - 'Silindir Sayısı'
    - 'Supap Sayısı'
    - 'Güç'
    - 'Tork'
    - 'Şanzıman'
    - 'Sürüş Tipi'
    - 'Yakıt Tipi'
    - 'Yakıt Deposu'
    - '0-100 km/s'
    - 'Maks. Hız'
    - 'Yakıt Tüketimi (Şehir)'
    - 'Yakıt Tüketimi (Yol)'
    - 'Yakıt Tüketimi (Karma)'
    - 'Uzunluk'
    - 'Genişlik'
    - 'Yükseklik'
    - 'Aks Mesafesi'
    - 'Bagaj Hacmi'
    - 'Ağırlık'
    - 'Hava Yastığı'
    - 'ABS'
    - 'ESP'
    - 'ISOFIX'
    - 'Acil Fren (AEB)'
    - 'Şerit Takip Sistemi'
    - 'Kör Nokta Uyarısı'
    - 'Yorgunluk Tespit'
    - 'Nesil'
    - 'Platform'
    - 'Üretim Yılları'
    - '0 km Fiyat'
    - '2. El Ortalama'
    - 'Fiyat Güncelleme'
    - 'Klima'
    - 'Navigasyon'
    - 'Bluetooth'
    - 'Kablosuz Şarj'
  )
)::json
WHERE data::jsonb->'specifications' IS NOT NULL;
